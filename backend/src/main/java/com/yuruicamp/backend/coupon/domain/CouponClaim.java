package com.yuruicamp.backend.coupon.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// 保存會員領券後的擁有與使用狀態。
@Entity
@Table(name = "coupon_claims")
public class CouponClaim {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "coupon_id", nullable = false)
	private Long couponId;

	@Column(name = "customer_id", nullable = false, length = 32)
	private String customerId;

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.NAMED_ENUM)
	@Column(nullable = false, columnDefinition = "coupon_claim_status")
	private CouponClaimStatus status;

	@Column(name = "claimed_at", nullable = false)
	private Instant claimedAt;

	@Column(name = "consumed_at")
	private Instant consumedAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	public static CouponClaim claimed(Long couponId, String customerId, Instant now) {
		CouponClaim claim = new CouponClaim();
		claim.couponId = couponId;
		claim.customerId = customerId;
		claim.status = CouponClaimStatus.claimed;
		claim.claimedAt = now;

		return claim;
	}

	/** 付款成功後把已套用到訂單的券改成 consumed（重複呼叫安全）。 */
	public boolean consume(Instant now) {
		if (status != CouponClaimStatus.claimed) {
			return false;
		}

		status = CouponClaimStatus.consumed;
		consumedAt = now;

		return true;
	}

	public Long getId() {
		return id;
	}

	public Long getCouponId() {
		return couponId;
	}

	public String getCustomerId() {
		return customerId;
	}

	public CouponClaimStatus getStatus() {
		return status;
	}

	public Instant getClaimedAt() {
		return claimedAt;
	}

	public Instant getConsumedAt() {
		return consumedAt;
	}

	// 取消或逾時時將 claim 標記為不可再使用，並保留失效時間。
	public boolean invalidate(CouponClaimStatus nextStatus, Instant now) {
		if (nextStatus != CouponClaimStatus.revoked && nextStatus != CouponClaimStatus.expired) {
			throw new IllegalArgumentException("Coupon claim terminal status is invalid");
		}
		if (status == nextStatus
				|| status == CouponClaimStatus.revoked
				|| status == CouponClaimStatus.expired) {
			return false;
		}

		status = nextStatus;
		consumedAt = null;
		revokedAt = now;

		return true;
	}
}
