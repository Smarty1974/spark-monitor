package com.mycompany.sparkmonitor.auth;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;

/**
 * JWT minimalista HS256 senza librerie esterne.
 * Struttura: base64url(header).base64url(payload).base64url(signature)
 */
@ApplicationScoped
public class JwtUtil {

    @Inject AuthConfig config;

    private static final String HEADER =
        Base64.getUrlEncoder().withoutPadding()
            .encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));

    public String generate(String username, String role) {
        long now = System.currentTimeMillis() / 1000;
        long exp = now + config.jwtExpirationSeconds();

        String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(
            ("{\"sub\":\"" + username + "\","
                + "\"role\":\"" + role + "\","
                + "\"iat\":" + now + ","
                + "\"exp\":" + exp + "}")
                .getBytes(StandardCharsets.UTF_8)
        );

        String signingInput = HEADER + "." + payload;
        String signature = hmacSha256(signingInput, config.jwtSecret());
        return signingInput + "." + signature;
    }

    public TokenPayload validate(String token) {
        if (token == null || token.isBlank()) throw new SecurityException("Token mancante");

        String[] parts = token.split("\\.");
        if (parts.length != 3) throw new SecurityException("Token malformato");

        String signingInput = parts[0] + "." + parts[1];
        String expectedSig  = hmacSha256(signingInput, config.jwtSecret());
        if (!expectedSig.equals(parts[2])) throw new SecurityException("Firma non valida");

        String payloadJson = new String(
            Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8
        );

        String username = extractField(payloadJson, "sub");
        String role     = extractField(payloadJson, "role");
        long   exp      = Long.parseLong(extractField(payloadJson, "exp"));

        if (System.currentTimeMillis() / 1000 > exp) throw new SecurityException("Token scaduto");

        return new TokenPayload(username, role);
    }

    private String hmacSha256(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        } catch (Exception e) {
            throw new RuntimeException("Errore HMAC", e);
        }
    }

    private String extractField(String json, String field) {
        // Parsing JSON minimale (no librerie): cerca "field":"value" o "field":number
        String key = "\"" + field + "\":";
        int idx = json.indexOf(key);
        if (idx < 0) throw new SecurityException("Campo '" + field + "' non trovato nel token");
        int start = idx + key.length();
        boolean isString = json.charAt(start) == '"';
        if (isString) start++;
        int end = isString
            ? json.indexOf('"', start)
            : json.indexOf(',', start);
        if (end < 0) end = json.indexOf('}', start);
        return json.substring(start, end);
    }

    public record TokenPayload(String username, String role) {}
}
