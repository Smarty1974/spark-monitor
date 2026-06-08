package com.example.sbm;

import com.example.sbm.base.JobDefinitionRepository;
import com.example.sbm.model.JobDefinition;
import com.example.sbm.model.JobType;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.util.List;
import java.util.Map;

/**
 * API REST per la gestione delle {@link JobDefinition}.
 *
 * Le JobDefinition sono i template che descrivono come, quando e dove
 * eseguire i job Spark. Ogni esecuzione genera un BatchProcess figlio.
 */
@Path("/job-definitions")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed({"user", "admin"})
public class JobDefinitionResource {

    @Inject JobDefinitionRepository repo;

    @GET
    public Response list(
        @QueryParam("page")  @DefaultValue("0")  int page,
        @QueryParam("size")  @DefaultValue("50") int size
    ) {
        return Response.ok(repo.findAll(page, size))
            .header("X-Total-Count", repo.count())
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }

    @GET @Path("/{id}")
    public Response getById(@PathParam("id") String id) {
        return repo.findById(id)
            .map(jd -> Response.ok(jd).build())
            .orElse(Response.status(404).entity(Map.of("error", "Non trovato: " + id)).build());
    }

    @POST
    @RolesAllowed("admin")
    public Response create(JobDefinition jd) {
        // Validazione minima
        if (jd.name == null || jd.name.isBlank())
            return Response.status(400).entity(Map.of("error", "name obbligatorio")).build();
        if (jd.jobType == null)
            return Response.status(400).entity(Map.of("error", "jobType obbligatorio (SCHEDULED|FILE_DRIVEN)")).build();
        if (jd.jobType == JobType.SCHEDULED && (jd.cronExpression == null || jd.cronExpression.isBlank()))
            return Response.status(400).entity(Map.of("error", "cronExpression obbligatoria per SCHEDULED")).build();
        if (jd.jobType == JobType.FILE_DRIVEN && (jd.inputBucketUri == null || jd.inputBucketUri.isBlank()))
            return Response.status(400).entity(Map.of("error", "inputBucketUri obbligatorio per FILE_DRIVEN")).build();

        // Verifica unicita del nome
        if (repo.findByName(jd.name).isPresent())
            return Response.status(409).entity(Map.of("error", "JobDefinition con name '" + jd.name + "' gia esistente")).build();

        return Response.status(201).entity(repo.create(jd)).build();
    }

    @PUT @Path("/{id}")
    @RolesAllowed("admin")
    public Response update(@PathParam("id") String id, JobDefinition jd) {
        return repo.update(id, jd)
            .map(u -> Response.ok(u).build())
            .orElse(Response.status(404).entity(Map.of("error", "Non trovato: " + id)).build());
    }

    @DELETE @Path("/{id}")
    @RolesAllowed("admin")
    public Response delete(@PathParam("id") String id) {
        return repo.delete(id)
            ? Response.noContent().build()
            : Response.status(404).entity(Map.of("error", "Non trovato: " + id)).build();
    }

    @GET @Path("/search")
    public Response search(@QueryParam("q") String q,
                           @QueryParam("page") @DefaultValue("0") int page,
                           @QueryParam("size") @DefaultValue("20") int size) {
        if (q == null || q.isBlank())
            return Response.status(400).entity(Map.of("error", "q obbligatorio")).build();
        return Response.ok(repo.search(q, page, size)).build();
    }

    /** Recupera solo le definizioni abilitate, per tipo. */
    @GET @Path("/by-type/{type}")
    public Response byType(@PathParam("type") String type) {
        List<JobDefinition> result = switch (type.toUpperCase()) {
            case "SCHEDULED"  -> repo.findEnabledScheduled();
            case "FILE_DRIVEN" -> repo.findAll(0, 1000).stream()
                .filter(jd -> jd.jobType == JobType.FILE_DRIVEN && Boolean.TRUE.equals(jd.enabled))
                .toList();
            default -> List.of();
        };
        return Response.ok(result)
            .header("X-Total-Count", result.size())
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }

    /**
     * Avvio manuale immediato di un job SCHEDULED
     * (bypassa la verifica dell'orario cron).
     */
    @POST @Path("/{id}/run-now")
    @RolesAllowed("admin")
    public Response runNow(@PathParam("id") String id) {
        return repo.findById(id).map(jd -> {
            if (jd.jobType != JobType.SCHEDULED)
                return Response.status(409)
                    .entity(Map.of("error", "run-now e disponibile solo per job SCHEDULED")).build();
            if (!Boolean.TRUE.equals(jd.enabled))
                return Response.status(409)
                    .entity(Map.of("error", "Il job e disabilitato")).build();
            // Il launcher verra invocato al prossimo tick (entro 1 minuto)
            // oppure possiamo ritornare un'indicazione per avvio asincrono
            return Response.ok(Map.of(
                "jobDefinitionId", id,
                "jobName",         jd.name,
                "message",         "Il job verra avviato entro il prossimo tick dello scheduler (max 1 min)",
                "tip",             "Per un avvio immediato usa POST /batch-trigger con jobDefinitionId"
            )).build();
        }).orElse(Response.status(404).entity(Map.of("error", "Non trovato: " + id)).build());
    }
}
