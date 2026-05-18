package com.mycompany.sparkmonitor.auth;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.Optional;

@ApplicationScoped
public class AuthService {

    @Inject AuthConfig config;
    @Inject JwtUtil    jwtUtil;

    public record LoginResult(String token, String username, String role) {}

    /**
     * Verifica username/password contro la lista configurata in application.properties.
     * Confronto password in plaintext (per semplicità); in produzione usare BCrypt.
     */
    public Optional<LoginResult> login(String username, String password) {
        return config.users().stream()
            .filter(u -> u.username().equals(username) && u.password().equals(password))
            .findFirst()
            .map(u -> {
                String token = jwtUtil.generate(u.username(), u.role());
                return new LoginResult(token, u.username(), u.role());
            });
    }
}
