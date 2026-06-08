package com.example.sbm;

import com.example.sbm.base.BatchProcessRepository;
import com.example.sbm.base.BucketConfigRepository;
import com.example.sbm.model.BatchProcess;
import com.example.sbm.model.BatchState;
import com.example.sbm.model.BucketConfig;
import com.example.sbm.model.HistoryEntry;
import com.google.cloud.dataproc.v1.*;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.Map;
import java.util.UUID;

/**
 * Endpoint per avviare il flusso batch:
 * FILE_RECEIVED -> [submit GCP] -> SPARK_SUBMITTED
 *
 * Chiamato da:
 * - GCS Eventarc (Cloud Run HTTP)
 * - S3 SNS/SQS webhook
 * - Frontend (Simulatore) per trigger manuali
 */
@Path("/batch-trigger")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class GcsTriggerResource {

    private static final Logger LOG = Logger.getLogger(GcsTriggerResource.class);

    @Inject BatchProcessRepository bpRepo;
    @Inject BucketConfigRepository bcRepo;

    @ConfigProperty(name = "gcp.project-id") String projectId;
    @ConfigProperty(name = "gcp.region")     String region;

    public record TriggerRequest(
        @NotBlank String bucketUri,
        @NotBlank String fileName,
        String bucketConfigId,
        String metadataJson,
        Long   fileSizeBytes
    ) {}

    /**
     * Avvia il flusso per un file caricato nel bucket.
     * 1. Crea BatchProcess in FILE_RECEIVED
     * 2. Sottomette batch a GCP Dataproc Serverless
     * 3. Aggiorna MongoDB a SPARK_SUBMITTED
     */
    @POST
    @RolesAllowed({"user", "admin"})
    public Response trigger(TriggerRequest req) {
        LOG.infof("Trigger -> bucket=%s file=%s", req.bucketUri(), req.fileName());
        try {
            // 1. Crea in FILE_RECEIVED
            var bp = new BatchProcess();
            bp.fileName      = req.fileName();
            bp.bucketUri     = req.bucketUri();
            bp.bucketConfigId= req.bucketConfigId();
            bp.metadataJson  = req.metadataJson();
            bp.fileSizeBytes = req.fileSizeBytes();
            bp.state         = BatchState.FILE_RECEIVED;
            bpRepo.create(bp);
            String processId = bp.id.toHexString();

            // 2. Determina configurazione Dataproc (da BucketConfig o default)
            String batchId  = "sbm-" + processId.substring(0, 8) + "-" +
                               UUID.randomUUID().toString().substring(0, 8);
            String batchResourceName = submitToDataproc(req, batchId);

            // 3. FILE_RECEIVED -> SPARK_SUBMITTED
            HistoryEntry entry = new HistoryEntry(
                BatchState.FILE_RECEIVED, BatchState.SPARK_SUBMITTED,
                "Job sottomesso a GCP Dataproc Serverless. batchResourceName=" + batchResourceName);
            bpRepo.transitionToSubmitted(processId, batchResourceName, batchId, entry);

            LOG.infof("[OK] Batch avviato - processId=%s batchResourceName=%s", processId, batchResourceName);
            return Response.status(201).entity(Map.of(
                "processId",         processId,
                "batchId",           batchId,
                "batchResourceName", batchResourceName,
                "state",             BatchState.SPARK_SUBMITTED.name()
            )).build();

        } catch (Exception e) {
            LOG.errorf(e, "Errore trigger per file %s", req.fileName());
            return Response.status(500).entity(Map.of(
                "error",   "Errore durante la sottomissione del job Spark",
                "details", e.getMessage()
            )).build();
        }
    }

    /**
     * Resubmit di un job fallito.
     * Rimette il processo in FILE_RECEIVED per una nuova elaborazione.
     */
    @POST @Path("/{processId}/resubmit")
    @RolesAllowed({"user", "admin"})
    public Response resubmit(@PathParam("processId") String processId) {
        return bpRepo.findById(processId).map(bp -> {
            if (bp.state != BatchState.FAILED && bp.state != BatchState.FILE_RECEIVED)
                return Response.status(409)
                    .entity(Map.of("error", "Resubmit consentito solo da FAILED o FILE_RECEIVED",
                        "currentState", bp.state.name())).build();
            return Response.ok(Map.of(
                "processId", processId,
                "message", "Pronto per re-elaborazione. Usa POST /batch-trigger per riavviare."
            )).build();
        }).orElse(Response.status(404).entity(Map.of("error", "Non trovato: " + processId)).build());
    }

    private String submitToDataproc(TriggerRequest req, String batchId) throws Exception {
        String endpoint = region + "-dataproc.googleapis.com:443";
        var settings = BatchControllerSettings.newBuilder().setEndpoint(endpoint).build();
        try (var client = BatchControllerClient.create(settings)) {
            String parent = "projects/" + projectId + "/locations/" + region;
            var pysparkBatch = PySparkBatch.newBuilder()
                .setMainPythonFileUri("gs://your-scripts-bucket/main.py")
                .addArgs("--input=" + req.bucketUri() + req.fileName())
                .build();
            var batch = Batch.newBuilder()
                .setPysparkBatch(pysparkBatch)
                .setRuntimeConfig(RuntimeConfig.newBuilder().setVersion("3.5")
                    .putProperties("spark.executor.memory", "4g").build())
                .build();
            // createBatchAsync e non-bloccante: il polling monitorera lo stato
            client.createBatchAsync(CreateBatchRequest.newBuilder()
                .setParent(parent).setBatch(batch).setBatchId(batchId).build());
            return parent + "/batches/" + batchId;
        }
    }
}
