package com.yuruicamp.backend.coupon.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;
import com.yuruicamp.backend.coupon.api.CouponClaimResponse;
import com.yuruicamp.backend.coupon.api.CouponResponse;
import com.yuruicamp.backend.coupon.domain.Coupon;
import com.yuruicamp.backend.coupon.domain.CouponClaim;
import com.yuruicamp.backend.coupon.domain.CouponClaimStatus;
import com.yuruicamp.backend.coupon.domain.CouponCategory;
import com.yuruicamp.backend.coupon.domain.CouponStatus;
import com.yuruicamp.backend.coupon.domain.OrderCoupon;
import com.yuruicamp.backend.coupon.infrastructure.CouponClaimRepository;
import com.yuruicamp.backend.coupon.infrastructure.CouponRepository;
import com.yuruicamp.backend.coupon.infrastructure.OrderCouponRepository;
import com.yuruicamp.backend.customer.domain.Customer;
import com.yuruicamp.backend.customer.infrastructure.CustomerRepository;
import com.yuruicamp.backend.order.domain.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
// 處理可領券、會員領券與商城 Checkout 套券規則。
public class CouponService {

	private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");
	private final CouponRepository coupons;
	private final CouponClaimRepository claims;
	private final OrderCouponRepository orderCoupons;
	private final CustomerRepository customers;

	public CouponService(CouponRepository coupons, CouponClaimRepository claims,
			OrderCouponRepository orderCoupons, CustomerRepository customers) {
		this.coupons = coupons;
		this.claims = claims;
		this.orderCoupons = orderCoupons;
		this.customers = customers;
	}

	// 列出仍在有效期間且尚有名額的公開優惠券。
	@Transactional(readOnly = true)
	public List<CouponResponse> publicCoupons() {
		return coupons.findPublicCoupons(CouponStatus.active, Instant.now()).stream()
				.map(CouponService::toCouponResponse)
				.toList();
	}

	// 列出會員目前與過去領取的優惠券。
	@Transactional(readOnly = true)
	public List<CouponClaimResponse> myCoupons(String customerId) {
		return claims.findByCustomerIdOrderByClaimedAtDesc(customerId).stream()
				.map(claim -> toClaimResponse(claim, coupons.findById(claim.getCouponId())
						.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Coupon not found"))))
				.toList();
	}

	// 驗證會員資格後領券，名額的原子配置交由既有 DB Trigger 處理。
	@Transactional
	public CouponClaimResponse claim(String customerId, Long couponId) {
		Customer customer = customer(customerId);
		Coupon coupon = coupons.findByIdForClaim(couponId)
				.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Coupon not found"));

		validateClaimable(customer, coupon, Instant.now());
		if (claims.existsByCouponIdAndCustomerId(couponId, customerId)) {
			throw new BusinessException(ErrorCode.COUPON_ALREADY_CLAIMED, "Coupon was already claimed");
		}

		try {
			CouponClaim saved = claims.saveAndFlush(CouponClaim.claimed(couponId, customerId, Instant.now()));

			return toClaimResponse(saved, coupon);
		}
		catch (DataIntegrityViolationException ex) {
			throw new BusinessException(ErrorCode.COUPON_SOLD_OUT,
					"Coupon is unavailable, sold out, or already claimed");
		}
	}

	// 將會員擁有的 claim 套用到訂單並建立快照；此時不消耗 claim。
	@Transactional
	public Long applyToOrder(Order order, String customerId, Long couponClaimId, Instant now) {
		if (couponClaimId == null) {
			orderCoupons.deleteByOrderId(order.getId());
			order.setPricing(order.getSubtotal(), order.getShippingFee(), BigDecimal.ZERO);

			return null;
		}

		Customer customer = customer(customerId);
		CouponClaim claim = claims.findOwnedForUpdate(couponClaimId, customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.COUPON_NOT_APPLICABLE,
						"Coupon claim not found or not owned by customer"));
		Coupon coupon = coupons.findById(claim.getCouponId())
				.orElseThrow(() -> new BusinessException(ErrorCode.COUPON_NOT_APPLICABLE, "Coupon not found"));
		validateApplicable(customer, claim, coupon, order.getSubtotal(), now);

		BigDecimal discount = calculateDiscount(coupon, order.getSubtotal());
		OrderCoupon existing = orderCoupons.findByOrderId(order.getId()).orElse(null);
		if (existing != null && couponClaimId.equals(existing.getCouponClaimId())) {
			// 同一訂單重送同一張券時保留原快照，讓套券操作可安全重試。
			order.setPricing(order.getSubtotal(), order.getShippingFee(), discount);

			return couponClaimId;
		}
		if (existing != null) {
			// 換券時先確實刪除舊快照，避免 Flush 將新增排在刪除之前。
			orderCoupons.delete(existing);
			orderCoupons.flush();
		}
		try {
			orderCoupons.saveAndFlush(OrderCoupon.snapshot(order.getId(), coupon, couponClaimId, discount, now));
		}
		catch (DataIntegrityViolationException ex) {
			throw new BusinessException(ErrorCode.COUPON_ALREADY_USED,
					"Coupon claim is already attached to another order");
		}
		order.setPricing(order.getSubtotal(), order.getShippingFee(), discount);

		return couponClaimId;
	}

	// 取得訂單目前套用的 claim ID。
	@Transactional(readOnly = true)
	public Long appliedClaimId(String orderId) {
		return orderCoupons.findByOrderId(orderId)
				.map(OrderCoupon::getCouponClaimId)
				.orElse(null);
	}

	// 訂單成立後消耗已套用的 claim；重複付款通知會保留第一次消耗時間。
	@Transactional
	public Long consumeAppliedClaim(String orderId, Instant now) {
		OrderCoupon appliedCoupon = orderCoupons.findByOrderId(orderId).orElse(null);
		if (appliedCoupon == null) {
			return null;
		}

		CouponClaim claim = claims.findByIdForUpdate(appliedCoupon.getCouponClaimId())
				.orElseThrow(() -> new BusinessException(
						ErrorCode.COUPON_NOT_APPLICABLE,
						"Applied coupon claim not found"));
		if (claim.getStatus() == CouponClaimStatus.consumed) {
			return claim.getId();
		}
		if (claim.getStatus() != CouponClaimStatus.claimed) {
			throw new BusinessException(
					ErrorCode.COUPON_NOT_APPLICABLE,
					"Applied coupon claim cannot be consumed");
		}

		claim.consume(now);

		return claim.getId();
	}

	// 主動取消使用 revoked，自動逾時使用 expired；兩者都不退回 claimed。
	@Transactional
	public Long invalidateAppliedClaim(String orderId, CouponClaimStatus nextStatus, Instant now) {
		if (nextStatus != CouponClaimStatus.revoked && nextStatus != CouponClaimStatus.expired) {
			throw new IllegalArgumentException("Coupon claim terminal status is invalid");
		}

		OrderCoupon appliedCoupon = orderCoupons.findByOrderId(orderId).orElse(null);
		if (appliedCoupon == null) {
			return null;
		}

		CouponClaim claim = claims.findByIdForUpdate(appliedCoupon.getCouponClaimId())
				.orElseThrow(() -> new BusinessException(
						ErrorCode.COUPON_NOT_APPLICABLE,
						"Applied coupon claim not found"));
		claim.invalidate(nextStatus, now);

		return claim.getId();
	}

	private static void validateClaimable(Customer customer, Coupon coupon, Instant now) {
		if (coupon.getStatus() != CouponStatus.active
				|| now.isBefore(coupon.getValidFrom())
				|| now.isAfter(coupon.getValidUntil())
				|| coupon.getClaimedQuantity() >= coupon.getIssueQuantity()) {
			throw new BusinessException(ErrorCode.COUPON_SOLD_OUT, "Coupon is unavailable or sold out");
		}
		validateCategory(customer, coupon);
	}

	private static void validateApplicable(Customer customer, CouponClaim claim, Coupon coupon,
			BigDecimal subtotal, Instant now) {
		if (claim.getStatus() != CouponClaimStatus.claimed
				|| coupon.getStatus() != CouponStatus.active
				|| now.isBefore(coupon.getValidFrom())
				|| now.isAfter(coupon.getValidUntil())
				|| subtotal.compareTo(coupon.getMinimumAmount()) < 0) {
			throw new BusinessException(ErrorCode.COUPON_NOT_APPLICABLE, "Coupon cannot be applied to this order");
		}
		validateCategory(customer, coupon);
	}

	// 生日券固定為台北時區的生日當月可領可用；首購券依會員旗標判斷。
	private static void validateCategory(Customer customer, Coupon coupon) {
		if (coupon.getCategory() == CouponCategory.birthday) {
			LocalDate birthday = customer.getBirthday();
			int currentMonth = LocalDate.now(TAIPEI).getMonthValue();
			if (birthday == null || birthday.getMonthValue() != currentMonth) {
				throw new BusinessException(ErrorCode.COUPON_NOT_ELIGIBLE, "Birthday coupon is limited to the birthday month");
			}
		}
		if (coupon.getCategory() == CouponCategory.firstPurchase && customer.isFirstPurchaseUsed()) {
			throw new BusinessException(ErrorCode.COUPON_NOT_ELIGIBLE, "First-purchase coupon is no longer available");
		}
	}

	private Customer customer(String customerId) {
		return customers.findById(customerId)
				.orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED, "Customer not found"));
	}

	private static BigDecimal calculateDiscount(Coupon coupon, BigDecimal subtotal) {
		BigDecimal discount = "percent".equals(coupon.getDiscountType())
				? subtotal.multiply(coupon.getDiscountValue())
						.divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP)
				: coupon.getDiscountValue();

		return discount.min(subtotal).setScale(2, RoundingMode.HALF_UP);
	}

	private static CouponResponse toCouponResponse(Coupon coupon) {
		return new CouponResponse(coupon.getId(), coupon.getCode(), coupon.getName(),
				coupon.getDiscountType(), money(coupon.getDiscountValue()), money(coupon.getMinimumAmount()),
				coupon.getCategory().name(), coupon.getStatus().name(), coupon.getValidFrom().toString(),
				coupon.getValidUntil().toString(), coupon.getIssueQuantity(), coupon.getClaimedQuantity(),
				Math.max(coupon.getIssueQuantity() - coupon.getClaimedQuantity(), 0));
	}

	private static CouponClaimResponse toClaimResponse(CouponClaim claim, Coupon coupon) {
		return new CouponClaimResponse(claim.getId(), claim.getCouponId(), claim.getStatus().name(),
				claim.getClaimedAt().toString(), claim.getConsumedAt() == null ? null : claim.getConsumedAt().toString(),
				toCouponResponse(coupon));
	}

	private static String money(BigDecimal value) {
		return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}
}
