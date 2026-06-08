package com.example.sbm.client;

import com.google.cloud.dataproc.v1.*;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.faulttolerance.Fallback;
import org.eclipse.microprofile.faulttolerance.Retry;
import org.eclipse.microprofile.faulttolerance.Timeout;
import org.jboss.logging.Logger;

import java.time.temporal.ChronoUnit;

/**
 * Client GCP Dataproc Serverless.
 *
 * <h3>Strategia di resilienza (SmallRye Fault Tolerance):</h3>
 * <ul>
 *   <li><b>@Retry</b>: 3 tentativi, delay 1 s + jitter 200 ms,
 *       solo su eccezioni di rete/timeout GCP.</li>
 *   <li><b>@Timeout</b>: 10 s per singola chiamata GCP.
 *       Se GCP non risponde, scatta il fallback.</li>
 *   <li><b>@Fallback</b>: restituisce {@code STATE_UNSPECIFIED} -
 *       lo scheduler lo ignora e riprova al prossimo tick (30 s).
 *       Il job NON viene marcato FAILED per un errore di rete temporaneo.</li>
 * </ul>
 *
 * <h3>Autenticazione GCP (ADC):</h3>
 * <ul>
 *   <li>Locale: {@code GOOGLE_APPLICATION_CREDENTIALS=/path/sa-key.json}</li>
 *   <li>GKE: Workload Identity Federation (automatico)</li>
 * </ul>
 */
@ApplicationScoped
public class DataprocClient {

    private static final Logger LOG = Logger.getLogger(DataprocClient.class);

    @ConfigProperty(name = "gcp.project-id") String projectId;
    @ConfigProperty(name = "gcp.region")     String region;

    /**
     * Recupera lo stato del batch GCP Dataproc Serverless.
     *
     * @param batchResourceName es. "projects/my-proj/locations/europe-west1/batches/sbm-abc123"
     * @return stato normalizzato
     */
    @Retry(
        maxRetries = 3,
        delay      = 1000, delayUnit = ChronoUnit.MILLIS,
        jitter     = 200,              // ms - jitterUnit non esiste in MP FT 4.x
        retryOn    = { java.io.IOException.class,
                       com.google.api.gax.rpc.ApiException.class,
                       java.util.concurrent.TimeoutException.class }
    )
    @Timeout(value = 10, unit = ChronoUnit.SECONDS)
    @Fallback(fallbackMethod = "getBatchStatusFallback")
    public DataprocBatchStatus getBatchStatus(String batchResourceName) {
        LOG.debugf("GCP Dataproc -> getBatch: %s", batchResourceName);
        try (BatchControllerClient client = buildClient()) {
            Batch batch = client.getBatch(batchResourceName);
            return new DataprocBatchStatus(
                mapState(batch.getState()),
                batch.getStateMessage(),
                batch.getUuid()
            );
        } catch (Exception e) {
            LOG.warnf("Errore GCP per batch %s: %s", batchResourceName, e.getMessage());
            throw new RuntimeException("GCP Dataproc error: " + e.getMessage(), e);
        }
    }

    /**
     * Fallback: API GCP non raggiungibile dopo tutti i retry.
     * Restituisce STATE_UNSPECIFIED - lo scheduler non aggiorna MongoDB
     * e riprovera al prossimo tick.
     */
    public DataprocBatchStatus getBatchStatusFallback(String batchResourceName) {
        LOG.warnf("FALLBACK attivo per batch %s - GCP non raggiungibile dopo 3 retry. " +
                  "Job restera SPARK_SUBMITTED fino al prossimo tick.", batchResourceName);
        return new DataprocBatchStatus(
            DataprocBatchState.STATE_UNSPECIFIED,
            "GCP API temporaneamente non raggiungibile - riprova al prossimo ciclo",
            null
        );
    }

    // -- Utility ---------------------------------------------------------------

    private BatchControllerClient buildClient() throws Exception {
        // Endpoint regionale obbligatorio per Dataproc Serverless
        String endpoint = region + "-dataproc.googleapis.com:443";
        BatchControllerSettings settings = BatchControllerSettings.newBuilder()
            .setEndpoint(endpoint)
            .build();
        return BatchControllerClient.create(settings);
    }

    private DataprocBatchState mapState(Batch.State gcpState) {
        return switch (gcpState) {
            case PENDING    -> DataprocBatchState.PENDING;
            case RUNNING    -> DataprocBatchState.RUNNING;
            case CANCELLING -> DataprocBatchState.CANCELLING;
            case CANCELLED  -> DataprocBatchState.CANCELLED;
            case SUCCEEDED  -> DataprocBatchState.SUCCEEDED;
            case FAILED     -> DataprocBatchState.FAILED;
            default         -> DataprocBatchState.STATE_UNSPECIFIED;
        };
    }
}
