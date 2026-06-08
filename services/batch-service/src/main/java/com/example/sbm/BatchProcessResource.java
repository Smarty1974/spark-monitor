package com.example.sbm;

import com.example.sbm.base.BatchProcessRepository;
import com.example.sbm.model.BatchProcess;
import com.example.sbm.model.BatchState;
import com.example.sbm.model.HistoryEntry;
import io.quarkus.scheduler.Scheduler;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.jboss.logging.Logger;

import java.util.List;
import java.util.Map;

/**
 * Resource REST per BatchProcess.
 * CRUD standard + endpoint custom (stats, state-machine, submit, by-state).
 */
@Path("/batch-processes")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed({"user", "admin"})
public class BatchProcessResource {

    private static final Logger LOG = Logger.getLogger(BatchProcessResource.class);

    @Inject BatchProcessRepository repo;
    @Inject Scheduler              scheduler;

    // -- CRUD standard ---------------------------------------------------------

    @GET
    public Response list(
        @QueryParam("page")  @DefaultValue("0")          int    page,
        @QueryParam("size")  @DefaultValue("20")          int    size,
        @QueryParam("sort")  @DefaultValue("createdAt")   String sort,
        @QueryParam("order") @DefaultValue("desc")        String order,
        @QueryParam("state")                               String stateFilter
    ) {
        List<BatchProcess> data = repo.findAll(page, size, sort, order);
        if (stateFilter != null && !stateFilter.isBlank()) {
            try {
                BatchState s = BatchState.valueOf(stateFilter.toUpperCase());
                data = data.stream().filter(bp -> bp.state == s).toList();
            } catch (IllegalArgumentException ignored) {}
        }
        return Response.ok(toDto(data))
            .header("X-Total-Count", repo.count())
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }

    @GET @Path("/{id}")
    public Response getById(@PathParam("id") String id) {
        return repo.findById(id)
            .map(bp -> Response.ok(toDto(bp)).build())
            .orElse(Response.status(404).entity(err("Non trovato: " + id)).build());
    }

    @POST
    public Response create(BatchProcessDto dto) {
        BatchProcess bp = fromDto(dto);
        return Response.status(201).entity(toDto(repo.create(bp))).build();
    }

    @PUT @Path("/{id}")
    public Response update(@PathParam("id") String id, BatchProcessDto dto) {
        return repo.update(id, fromDto(dto))
            .map(bp -> Response.ok(toDto(bp)).build())
            .orElse(Response.status(404).entity(err("Non trovato: " + id)).build());
    }

    @DELETE @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        return repo.delete(id)
            ? Response.noContent().build()
            : Response.status(404).entity(err("Non trovato: " + id)).build();
    }

    @GET @Path("/search")
    public Response search(@QueryParam("q") String q,
                           @QueryParam("page") @DefaultValue("0")  int page,
                           @QueryParam("size") @DefaultValue("20") int size) {
        if (q == null || q.isBlank())
            return Response.status(400).entity(err("Parametro 'q' obbligatorio")).build();
        return Response.ok(toDto(repo.search(q, page, size))).build();
    }

    // -- Endpoint custom -------------------------------------------------------

    /** Statistiche aggregate per la dashboard. */
    @GET @Path("/stats")
    @PermitAll
    public Response getStats() {
        long total          = repo.count();
        long fileReceived   = repo.countByState(BatchState.FILE_RECEIVED);
        long sparkSubmitted = repo.countByState(BatchState.SPARK_SUBMITTED);
        long completed      = repo.countByState(BatchState.COMPLETED);
        long failed         = repo.countByState(BatchState.FAILED);
        double successRate  = total > 0 ? (double) completed / total * 100 : 0;

        return Response.ok(Map.of(
            "total", total, "fileReceived", fileReceived,
            "sparkSubmitted", sparkSubmitted, "completed", completed,
            "failed", failed, "successRate", successRate
        )).build();
    }

    /** Definizione JSON della state machine (usata dal frontend per il diagramma). */
    @GET @Path("/state-machine")
    @PermitAll
    public Response getStateMachine() {
        return Response.ok(Map.of(
            "states", List.of(
                Map.of("id","FILE_RECEIVED",   "label","File Ricevuto",    "type","initial", "color","#1565c0"),
                Map.of("id","SPARK_SUBMITTED", "label","Spark Sottomesso", "type","running", "color","#e65100"),
                Map.of("id","COMPLETED",       "label","Completato",       "type","success", "color","#1b5e20"),
                Map.of("id","FAILED",          "label","Fallito",          "type","error",   "color","#b71c1c")
            ),
            "transitions", List.of(
                Map.of("from","FILE_RECEIVED",   "to","SPARK_SUBMITTED","label","Submit Spark",          "trigger","GCS/S3/manuale"),
                Map.of("from","SPARK_SUBMITTED", "to","COMPLETED",      "label","GCP: SUCCEEDED",       "trigger","scheduler 30s"),
                Map.of("from","SPARK_SUBMITTED", "to","FAILED",         "label","GCP: FAILED/CANCELLED","trigger","scheduler 30s"),
                Map.of("from","SPARK_SUBMITTED", "to","FAILED",         "label","Timeout 2h",           "trigger","circuit-breaker"),
                Map.of("from","FAILED",          "to","FILE_RECEIVED",  "label","Resubmit",             "trigger","manuale")
            )
        )).build();
    }

    /** Transizione manuale FILE_RECEIVED -> SPARK_SUBMITTED. */
    @POST @Path("/{id}/submit")
    public Response submitToSpark(@PathParam("id") String id, SubmitRequest req) {
        HistoryEntry entry = new HistoryEntry(BatchState.FILE_RECEIVED, BatchState.SPARK_SUBMITTED,
            "Job sottomesso. batchResourceName=" + req.batchResourceName);
        boolean ok = repo.transitionToSubmitted(id, req.batchResourceName, req.sparkJobId, entry);
        if (!ok) return Response.status(409)
            .entity(err("Transizione non valida: processo non in FILE_RECEIVED o gia SPARK_SUBMITTED")).build();
        return repo.findById(id).map(bp -> Response.ok(toDto(bp)).build())
            .orElse(Response.status(404).entity(err("Non trovato: " + id)).build());
    }

    /** Stato e controllo scheduler. */
    @GET @Path("/scheduler/status")
    @RolesAllowed("admin")
    public Response schedulerStatus() {
        // In Quarkus 3.15 Scheduler.isPaused() richiede il trigger identity.
        // Usiamo getScheduledJobs() per verificare se lo scheduler e attivo.
        boolean running = !scheduler.getScheduledJobs().isEmpty();
        return Response.ok(Map.of(
            "running", running,
            "jobIdentity", "SparkMonitoringScheduler#pollSparkJobs"
        )).build();
    }

    @POST @Path("/scheduler/pause")
    @RolesAllowed("admin")
    public Response schedulerPause() { scheduler.pause(); return Response.ok(Map.of("running", false)).build(); }

    @POST @Path("/scheduler/resume")
    @RolesAllowed("admin")
    public Response schedulerResume() { scheduler.resume(); return Response.ok(Map.of("running", true)).build(); }

    // -- DTO interni -----------------------------------------------------------

    public record BatchProcessDto(
        String id, String fileName, String bucketUri,
        String batchResourceName, String state, String errorMessage,
        String sparkJobId, String bucketConfigId, Long fileSizeBytes,
        String metadataJson, List<HistoryEntry> history,
        String createdAt, String updatedAt
    ) {}

    public record SubmitRequest(
        @NotBlank String batchResourceName,
        String sparkJobId
    ) {}

    private BatchProcessDto toDto(BatchProcess bp) {
        return new BatchProcessDto(
            bp.id != null ? bp.id.toHexString() : null,
            bp.fileName, bp.bucketUri, bp.batchResourceName,
            bp.state != null ? bp.state.name() : null,
            bp.errorMessage, bp.sparkJobId, bp.bucketConfigId,
            bp.fileSizeBytes, bp.metadataJson, bp.history,
            bp.createdAt != null ? bp.createdAt.toString() : null,
            bp.updatedAt != null ? bp.updatedAt.toString() : null
        );
    }

    private List<Object> toDto(List<BatchProcess> list) {
        return list.stream().map(bp -> (Object) toDto(bp)).toList();
    }

    private BatchProcess fromDto(BatchProcessDto dto) {
        var bp = new BatchProcess();
        bp.fileName          = dto.fileName();
        bp.bucketUri         = dto.bucketUri();
        bp.batchResourceName = dto.batchResourceName();
        bp.state             = dto.state() != null ? BatchState.valueOf(dto.state()) : BatchState.FILE_RECEIVED;
        bp.errorMessage      = dto.errorMessage();
        bp.sparkJobId        = dto.sparkJobId();
        bp.bucketConfigId    = dto.bucketConfigId();
        bp.fileSizeBytes     = dto.fileSizeBytes();
        bp.metadataJson      = dto.metadataJson();
        return bp;
    }

    private Map<String, String> err(String msg) { return Map.of("error", msg); }
}
