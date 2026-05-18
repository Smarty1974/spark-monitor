package com.mycompany.sparkmonitor.auth;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Auth", description = "Autenticazione utenti")
public class AuthResource {

    @Inject AuthService authService;
    @Inject JwtUtil     jwtUtil;

    // ── Request / Response DTO ───────────────────────────────────────────────

    public record LoginRequest(
        @NotBlank String username,
        @NotBlank String password
    ) {}

    public record LoginResponse(
        String token,
        String username,
        String role
    ) {}

    public record MeResponse(
        String username,
        String role
    ) {}

    public record ErrorResponse(String message) {}

    // ── POST /api/auth/login ─────────────────────────────────────────────────

    @POST
    @Path("/login")
    @Operation(summary = "Login — restituisce un token JWT")
    public Response login(@Valid LoginRequest req) {
        return authService.login(req.username(), req.password())
            .map(r -> Response.ok(new LoginResponse(r.token(), r.username(), r.role())).build())
            .orElse(Response.status(401)
                .entity(new ErrorResponse("Credenziali non valide")).build());
    }

    // ── GET /api/auth/me ─────────────────────────────────────────────────────

    @GET
    @Path("/me")
    @Operation(summary = "Restituisce l'utente associato al token corrente")
    public Response me(@HeaderParam("Authorization") String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return Response.status(401)
                .entity(new ErrorResponse("Token mancante o formato non valido")).build();
        }
        try {
            String token = authHeader.substring(7);
            JwtUtil.TokenPayload payload = jwtUtil.validate(token);
            return Response.ok(new MeResponse(payload.username(), payload.role())).build();
        } catch (SecurityException e) {
            return Response.status(401).entity(new ErrorResponse(e.getMessage())).build();
        }
    }
}
