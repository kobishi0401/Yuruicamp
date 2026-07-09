package com.Yuricamp.backend.order;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 訂單資料存取層，提供訂單儲存與依訂單編號查詢。
 */
public interface OrderRepository extends JpaRepository<CustomerOrder, Long> {

    /**
     * 依對外訂單編號查詢訂單。
     */
    Optional<CustomerOrder> findByOrderNo(String orderNo);
}
