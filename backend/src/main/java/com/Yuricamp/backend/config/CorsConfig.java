package com.Yuricamp.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS 設定，允許本機前端開發伺服器呼叫後端 API。
 * 前端 Vite：http://localhost:5173
 * 後端 Spring Boot：http://localhost:8080
 */
@Configuration
public class CorsConfig {

    /**
     * 設定 /api/** 路徑允許常見前端 localhost port 跨域存取。
     */
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            /**
             * 註冊跨域規則，開發階段允許 Vite 與常見前端 port。
             */
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOrigins(
                                "http://localhost:5173",
                                "http://127.0.0.1:5173",
                                "http://localhost:3000",
                                "http://127.0.0.1:3000"
                        )
                        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                        .allowedHeaders("*");
            }
        };
    }
}
