package com.bank.lms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * CORS for the browser client.
 *
 * <p>The Vite dev server proxies {@code /api} to this backend, which keeps
 * requests same-origin in normal development and makes this configuration
 * unnecessary. It exists for the case where the frontend is served from a
 * different origin - a separate static host, for instance - which is exactly
 * when a misconfigured CORS policy starts leaking authenticated responses.
 *
 * <p>Origins are an explicit allow-list, never {@code *}: credentials
 * (the session cookie) may not be sent to a wildcard origin.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final List<String> allowedOrigins;

    public CorsConfig(
            @Value("${app.cors.allowed-origins:http://localhost:5173}") List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "X-XSRF-TOKEN")
                .exposedHeaders("Location")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
