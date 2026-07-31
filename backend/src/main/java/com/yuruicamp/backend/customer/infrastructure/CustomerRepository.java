package com.yuruicamp.backend.customer.infrastructure;

import java.util.Optional;

import com.yuruicamp.backend.customer.domain.Customer;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

// 讀取與儲存會員資料。
public interface CustomerRepository extends JpaRepository<Customer, String> {

	Optional<Customer> findByFirebaseUid(String firebaseUid);

	Optional<Customer> findByEmailIgnoreCase(String email);

	Optional<Customer> findByLineUserId(String lineUserId);

	// 鎖定會員資料，避免同一會員同時重複建立訂單。
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from Customer c where c.id = :id")
	Optional<Customer> findByIdForCheckout(@Param("id") String id);

	// 後台更新會員前先鎖定資料，避免基本資料與停權操作互相覆蓋。
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from Customer c where c.id = :id")
	Optional<Customer> findByIdForUpdate(@Param("id") String id);
}
