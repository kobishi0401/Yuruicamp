package com.yuruicamp.backend.coupon.infrastructure;

import java.util.List;
import java.util.Optional;

import com.yuruicamp.backend.coupon.domain.CouponClaim;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

// 讀取會員領券，套券時鎖定 claim 防止重複使用。
public interface CouponClaimRepository extends JpaRepository<CouponClaim, Long> {

	List<CouponClaim> findByCustomerIdOrderByClaimedAtDesc(String customerId);

	boolean existsByCouponIdAndCustomerId(Long couponId, String customerId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select claim from CouponClaim claim where claim.id=:id and claim.customerId=:customerId")
	Optional<CouponClaim> findOwnedForUpdate(@Param("id") Long id,
			@Param("customerId") String customerId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select claim from CouponClaim claim where claim.id=:id")
	Optional<CouponClaim> findByIdForUpdate(@Param("id") Long id);
}
