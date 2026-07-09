package com.Yuricamp.backend.config;

import com.Yuricamp.backend.catalog.Product;
import com.Yuricamp.backend.catalog.ProductRepository;
import com.Yuricamp.backend.catalog.ProductStatus;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;
import java.util.List;

/**
 * 開發用 seed data 設定，啟動時自動建立商品測試資料。
 */
@Configuration
public class SeedDataConfig {

    /**
     * 若商品表為空，建立幾筆商品資料供前端串接測試。
     */
    @Bean
    public CommandLineRunner seedProducts(ProductRepository productRepository) {
        return args -> {
            if (productRepository.count() > 0) {
                return;
            }

            List<Product> products = List.of(
                    new Product(
                            "豪華露營雙人套組",
                            "適合雙人入住的豪華露營方案，包含帳篷、寢具與基本炊具。",
                            "GLAMPING",
                            new BigDecimal("3200.00"),
                            8,
                            "https://images.unsplash.com/photo-1504851149312-7a075b496cc7",
                            ProductStatus.ACTIVE
                    ),
                    new Product(
                            "家庭露營四人套組",
                            "適合家庭使用的四人露營組合，包含大型帳篷與桌椅設備。",
                            "FAMILY",
                            new BigDecimal("4800.00"),
                            5,
                            "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d",
                            ProductStatus.ACTIVE
                    ),
                    new Product(
                            "露營烤肉食材箱",
                            "預先搭配好的烤肉食材箱，適合 3 至 4 人使用。",
                            "FOOD",
                            new BigDecimal("1280.00"),
                            20,
                            "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba",
                            ProductStatus.ACTIVE
                    ),
                    new Product(
                            "營燈與延長線租借",
                            "露營照明與用電配件租借，適合夜間活動使用。",
                            "EQUIPMENT",
                            new BigDecimal("350.00"),
                            15,
                            "https://images.unsplash.com/photo-1478827536114-da961b7f86d2",
                            ProductStatus.ACTIVE
                    ),
                    new Product(
                            "寵物友善加購服務",
                            "提供寵物清潔包與指定寵物友善營位安排。",
                            "SERVICE",
                            new BigDecimal("600.00"),
                            10,
                            "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
                            ProductStatus.ACTIVE
                    )
            );

            productRepository.saveAll(products);
        };
    }
}
