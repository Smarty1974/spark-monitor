package com.mycompany.sparkmonitor.auth;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;
import java.util.List;
import java.util.Optional;

/**
 * Legge la lista utenti da application.properties.
 *
 * Formato proprietà:
 *   auth.users[0].username=admin
 *   auth.users[0].password=admin123
 *   auth.users[0].role=ADMIN
 *
 *   auth.users[1].username=viewer
 *   auth.users[1].password=viewer123
 *   auth.users[1].role=VIEWER
 */
@ConfigMapping(prefix = "auth")
public interface AuthConfig {

    List<UserEntry> users();

    @WithDefault("spark-monitor-secret-key-change-in-production")
    String jwtSecret();

    @WithDefault("86400")   // 24 ore in secondi
    long jwtExpirationSeconds();

    interface UserEntry {
        String username();
        String password();
        @WithDefault("VIEWER")
        String role();
    }
}
