package com.yuruicamp.backend.auth.infrastructure;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collection;
import java.util.Locale;
import java.util.Map;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.config.YuruicampProperties;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Verifies real Firebase ID Tokens via Firebase Admin SDK.
 */
@Component
@ConditionalOnProperty(prefix = "yuruicamp.firebase", name = "enabled", havingValue = "true")
public class RealFirebaseTokenVerifier implements FirebaseTokenVerifier {

	private static final Logger log = LoggerFactory.getLogger(RealFirebaseTokenVerifier.class);

	private final YuruicampProperties properties;

	public RealFirebaseTokenVerifier(YuruicampProperties properties) {
		this.properties = properties;
	}

	@PostConstruct
	void initFirebase() {
		if (!FirebaseApp.getApps().isEmpty()) {
			FirebaseApp existing = FirebaseApp.getInstance();
			log.info(
					"Firebase Admin already initialized (projectId={}); skip re-init",
					existing.getOptions().getProjectId());
			return;
		}
		String path = properties.getFirebase().getCredentialsPath();
		if (!StringUtils.hasText(path)) {
			throw new IllegalStateException(
					"yuruicamp.firebase.enabled=true requires yuruicamp.firebase.credentials-path");
		}
		try (InputStream in = new FileInputStream(path)) {
			GoogleCredentials credentials = GoogleCredentials.fromStream(in);
			String projectId = resolveProjectId(credentials);

			FirebaseOptions.Builder optionsBuilder = FirebaseOptions.builder().setCredentials(credentials);
			if (StringUtils.hasText(projectId)) {
				// Explicit projectId avoids ambiguous Admin binding when verifying ID tokens
				optionsBuilder.setProjectId(projectId);
			}

			FirebaseApp app = FirebaseApp.initializeApp(optionsBuilder.build());
			log.info(
					"Firebase Admin initialized from {} (projectId={})",
					path,
					app.getOptions().getProjectId());
		}
		catch (IOException ex) {
			throw new IllegalStateException("Failed to load Firebase credentials: " + path, ex);
		}
	}

	/**
	 * Prefer configured {@code yuruicamp.firebase.project-id}, else service-account JSON.
	 */
	private String resolveProjectId(GoogleCredentials credentials) {
		String configured = properties.getFirebase().getProjectId();
		if (StringUtils.hasText(configured)) {
			return configured.trim();
		}
		if (credentials instanceof ServiceAccountCredentials serviceAccount
				&& StringUtils.hasText(serviceAccount.getProjectId())) {
			return serviceAccount.getProjectId();
		}
		log.warn("Firebase projectId is empty; set FIREBASE_PROJECT_ID or fix service-account JSON");
		return null;
	}

	@Override
	public VerifiedFirebaseToken verify(String idToken) {
		if (idToken == null || idToken.isBlank()) {
			throw new BusinessException(ErrorCode.UNAUTHORIZED, "Missing Firebase ID token");
		}
		try {
			FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(idToken.trim());
			String provider = mapProvider(decoded);
			String email = decoded.getEmail();
			// LINE 等 OIDC 常沒有 email：合成穩定唯一信箱，方便 upsert／查詢
			// LINE/OIDC often omit email — synthesize a stable unique address for DB
			if (email == null || email.isBlank()) {
				email = provider + "." + decoded.getUid() + "@noreply.yuruicamp.local";
				log.info("Firebase token has no email; using synthetic email for provider={}", provider);
			}
			String name = decoded.getName() != null && !decoded.getName().isBlank()
					? decoded.getName()
					: email;
			return new VerifiedFirebaseToken(
					decoded.getUid(),
					email.toLowerCase(Locale.ROOT),
					name,
					provider,
					decoded.getPicture(),
					extractLineUserId(decoded));
		}
		catch (FirebaseAuthException ex) {
			// Log real cause for ops/debug; do not put token or full stack detail into API body
			log.warn(
					"Firebase verifyIdToken failed: authErrorCode={}, message={}, cause={}",
					ex.getAuthErrorCode(),
					ex.getMessage(),
					ex.getCause() != null ? ex.getCause().toString() : null);
			throw new BusinessException(ErrorCode.UNAUTHORIZED, "Invalid Firebase ID token");
		}
	}

	private static String mapProvider(FirebaseToken decoded) {
		Object firebaseClaim = decoded.getClaims().get("firebase");
		if (firebaseClaim instanceof Map<?, ?> map) {
			Object signInProvider = map.get("sign_in_provider");
			if (signInProvider != null) {
				String raw = signInProvider.toString().toLowerCase(Locale.ROOT);
				if (raw.contains("google")) {
					return "google";
				}
				if (raw.contains("facebook")) {
					return "facebook";
				}
				// Identity Platform LINE：sign_in_provider 常為 "oidc.line"
				if (raw.contains("line")) {
					return "line";
				}
			}
		}
		return "google";
	}

	/**
	 * LINE User ID from Firebase {@code identities} (e.g. {@code oidc.line: ["U…"]}).
	 * Works for pure LINE login and Account Linking onto Google (same claim map).
	 */
	private static String extractLineUserId(FirebaseToken decoded) {
		Object firebaseClaim = decoded.getClaims().get("firebase");
		if (!(firebaseClaim instanceof Map<?, ?> map)) {
			return null;
		}
		Object identities = map.get("identities");
		if (!(identities instanceof Map<?, ?> idMap)) {
			return null;
		}
		for (Map.Entry<?, ?> entry : idMap.entrySet()) {
			if (entry.getKey() == null) {
				continue;
			}
			String key = entry.getKey().toString().toLowerCase(Locale.ROOT);
			if (!key.contains("line")) {
				continue;
			}
			String first = firstIdentityValue(entry.getValue());
			if (first != null) {
				return first;
			}
		}
		return null;
	}

	private static String firstIdentityValue(Object value) {
		if (value instanceof Collection<?> collection) {
			for (Object item : collection) {
				if (item != null) {
					String text = item.toString().trim();
					if (!text.isEmpty()) {
						return text;
					}
				}
			}
			return null;
		}
		if (value instanceof Object[] array) {
			for (Object item : array) {
				if (item != null) {
					String text = item.toString().trim();
					if (!text.isEmpty()) {
						return text;
					}
				}
			}
		}
		return null;
	}
}
