package com.yuruicamp.backend.auth.infrastructure;

import com.yuruicamp.backend.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DevFirebaseTokenVerifierTest {

	private final DevFirebaseTokenVerifier verifier = new DevFirebaseTokenVerifier();

	@Test
	void verifiesDevToken() {
		VerifiedFirebaseToken token = verifier.verify("dev:uid1:Amy@Example.com:google:Amy Chen");
		assertEquals("uid1", token.uid());
		assertEquals("amy@example.com", token.email());
		assertEquals("google", token.authProvider());
		assertEquals("Amy Chen", token.displayName());
		assertNull(token.lineUserId());
	}

	@Test
	void verifiesOptionalLineUserIdWithoutBreakingLegacyTokens() {
		VerifiedFirebaseToken token = verifier.verify("dev:uid1:amy@example.com:line:Amy:UlineDev001");
		assertEquals("line", token.authProvider());
		assertEquals("Amy", token.displayName());
		assertEquals("UlineDev001", token.lineUserId());
	}

	@Test
	void rejectsNonDevToken() {
		assertThrows(BusinessException.class, () -> verifier.verify("eyJhbGciOiJSUzI1NiJ9.fake"));
	}
}
