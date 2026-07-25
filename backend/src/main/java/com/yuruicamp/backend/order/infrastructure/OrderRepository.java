package com.yuruicamp.backend.order.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import com.yuruicamp.backend.order.domain.Order;
import com.yuruicamp.backend.order.domain.OrderStatus;
import com.yuruicamp.backend.order.domain.PaymentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

// 讀取與儲存訂單資料。
public interface OrderRepository extends JpaRepository<Order, String> {

	// 取得會員的所有訂單。
	@Query("select distinct o from Order o left join fetch o.items where o.customerId=:customerId order by o.placedAt desc")
	List<Order> findAllForCustomer(@Param("customerId") String customerId);

	// 取得會員自己的指定訂單。
	@Query("select distinct o from Order o left join fetch o.items where o.id=:id and o.customerId=:customerId")
	Optional<Order> findForCustomer(@Param("id") String id, @Param("customerId") String customerId);

	// 鎖定會員自己的 Checkout，避免更新與付款或逾時處理互相覆蓋。
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from Order o where o.id=:id and o.customerId=:customerId")
	Optional<Order> findForCustomerForUpdate(@Param("id") String id,
			@Param("customerId") String customerId);

	// ECPay Notify 不帶會員身分，以訂單主鍵鎖定避免與逾時／取消競爭。
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from Order o where o.id=:id")
	Optional<Order> findByIdForUpdate(@Param("id") String id);

	// 使用會員與冪等鍵尋找已建立的訂單。
	@Query("select distinct o from Order o left join fetch o.items where o.customerId=:customerId and o.checkoutIdempotencyKey=:idempotencyKey")
	Optional<Order> findByCheckoutIdempotencyKey(@Param("customerId") String customerId,
			@Param("idempotencyKey") String idempotencyKey);

	// 鎖定已到期的未付款訂單，避免付款與逾時處理同時修改同一張訂單。
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select o from Order o
			where o.paymentStatus=:paymentStatus
			  and o.status<>:cancelledStatus
			  and o.checkoutExpiresAt is not null
			  and o.checkoutExpiresAt<=:now
			order by o.checkoutExpiresAt asc
			""")
	List<Order> findDueForExpiration(@Param("paymentStatus") PaymentStatus paymentStatus,
			@Param("cancelledStatus") OrderStatus cancelledStatus,
			@Param("now") Instant now);
}
