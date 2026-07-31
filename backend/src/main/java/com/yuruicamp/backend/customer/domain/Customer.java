package com.yuruicamp.backend.customer.domain;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "customers")
public class Customer {

	@Id
	@Column(length = 32)
	private String id;

	@Column(nullable = false, length = 100)
	private String name;

	@Column(length = 32)
	private String phone;

	@Column(nullable = false, length = 255, unique = true)
	private String email;

	private LocalDate birthday;

	@Column(name = "registered_at", nullable = false)
	private Instant registeredAt;

	@Column(length = 32)
	private String tier;

	@Column(name = "tier_name", length = 64)
	private String tierName;

	@Column(nullable = false)
	private int points;

	@Column(name = "first_purchase_used", nullable = false)
	private boolean firstPurchaseUsed;

	@Column(name = "auth_provider", nullable = false, length = 32)
	private String authProvider;

	@Column(name = "firebase_uid", length = 128)
	private String firebaseUid;

	/** LINE platform user id (U…); unique when non-null. Used for CS / n8n lookup. */
	@Column(name = "line_user_id", length = 64)
	private String lineUserId;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "avatar_url")
	private String avatarUrl;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	@Enumerated(EnumType.STRING)
	@JdbcTypeCode(SqlTypes.NAMED_ENUM)
	@Column(nullable = false, columnDefinition = "customer_status")
	private CustomerStatus status;

	public String getId() {
		return id;
	}

	public void setId(String id) {
		this.id = id;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getPhone() {
		return phone;
	}

	public void setPhone(String phone) {
		this.phone = phone;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public LocalDate getBirthday() {
		return birthday;
	}

	public void setBirthday(LocalDate birthday) {
		this.birthday = birthday;
	}

	public Instant getRegisteredAt() {
		return registeredAt;
	}

	public void setRegisteredAt(Instant registeredAt) {
		this.registeredAt = registeredAt;
	}

	public String getTier() {
		return tier;
	}

	public void setTier(String tier) {
		this.tier = tier;
	}

	public String getTierName() {
		return tierName;
	}

	public void setTierName(String tierName) {
		this.tierName = tierName;
	}

	public int getPoints() {
		return points;
	}

	public void setPoints(int points) {
		this.points = points;
	}

	public boolean isFirstPurchaseUsed() {
		return firstPurchaseUsed;
	}

	public void setFirstPurchaseUsed(boolean firstPurchaseUsed) {
		this.firstPurchaseUsed = firstPurchaseUsed;
	}

	public String getAuthProvider() {
		return authProvider;
	}

	public void setAuthProvider(String authProvider) {
		this.authProvider = authProvider;
	}

	public String getFirebaseUid() {
		return firebaseUid;
	}

	public void setFirebaseUid(String firebaseUid) {
		this.firebaseUid = firebaseUid;
	}

	public String getLineUserId() {
		return lineUserId;
	}

	public void setLineUserId(String lineUserId) {
		this.lineUserId = lineUserId;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(Instant createdAt) {
		this.createdAt = createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(Instant updatedAt) {
		this.updatedAt = updatedAt;
	}

	public String getAvatarUrl() {
		return avatarUrl;
	}

	public void setAvatarUrl(String avatarUrl) {
		this.avatarUrl = avatarUrl;
	}

	public Instant getDeletedAt() {
		return deletedAt;
	}

	public void setDeletedAt(Instant deletedAt) {
		this.deletedAt = deletedAt;
	}

	public CustomerStatus getStatus() {
		return status;
	}

	public void setStatus(CustomerStatus status) {
		this.status = status;
	}
}
