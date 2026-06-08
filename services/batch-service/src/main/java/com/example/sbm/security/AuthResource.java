package com.example.sbm.security;

import io.smallrye.jwt.build.Jwt;
import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.util.Map;
import java.util.Set;

/**
 * JWT Auth - MVP hardcoded (admin/admin123).
 * In produzione: integrare con Google IAM / LDAP / OAuth2.
 */
@Path("/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AuthResource {

    public record LoginRequest(String username, String password) {}

    @POST @Path("/login") @PermitAll
    public Response login(LoginRequest req) {
        if (req == null || !"admin".equals(req.username()) || !"admin123".equals(req.password()))
            return Response.status(401).entity(Map.of("message", "Credenziali non valide")).build();

        String token = Jwt.issuer("https://sbm.example.com")
            .subject(req.username())
            .groups(Set.of("user", "admin"))
            .expiresIn(28800L)
            .sign();

        return Response.ok(Map.of(
            "token", token,
            "user", Map.of("username", "admin", "fullName", "Amministratore SBM",
                           "roles", Set.of("user", "admin"))
        )).build();
    }

    @POST @Path("/logout") @PermitAll
    public Response logout() {
        return Response.ok(Map.of("message", "Logout effettuato")).build();
    }
}
