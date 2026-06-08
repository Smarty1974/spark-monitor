package com.example.sbm.scheduler;

import com.example.sbm.base.BatchProcessRepository;
import com.example.sbm.base.BatchProcessRepository.PollingProjection;
import com.example.sbm.client.DataprocBatchState;
import com.example.sbm.client.DataprocBatchStatus;
import com.example.sbm.client.DataprocClient;
import com.example.sbm.model.BatchState;
import com.example.sbm.model.HistoryEntry;
import com.example.sbm.service.NotificationService;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Scheduler di monitoraggio job Spark su GCP Dataproc Serverless.
 *
 * <h2>Flusso per tick (ogni 30 s):</h2>
 * <ol>
 *   <li>Carica da MongoDB i processi {@code SPARK_SUBMITTED}
 *       con <b>proiezione minima</b> (solo id, batchResourceName, fileName, updatedAt).</li>
 *   <li>Separa i job <b>scaduti</b> (age >= timeout) dai job da interrogare a GCP.</li>
 *   <li>I job scaduti vengono forzati a {@code FAILED} ("Timeout Superato")
 *       - <b>nessuna chiamata GCP</b> per essi.</li>
 *   <li>I job attivi vengono interrogati in parallelo (max {@code maxParallel} thread)
 *       con timeout globale 25 s (< 30 s del tick).</li>
 *   <li>Per ogni job: applica la transizione di stato MongoDB atomica.</li>
 * </ol>
 *
 * <h2>Fault isolation:</h2>
 * Ogni job e processato in un {@code try-catch} indipendente: un errore non gestito
 * su un job non blocca il loop degli altri. I fallback del {@link DataprocClient}
 * restituiscono {@code STATE_UNSPECIFIED} -> lo scheduler lo ignora silenziosamente.
 *
 * <h2>concurrentExecution = SKIP:</h2>
 * Se il tick precedente e ancora in esecuzione al momento del successivo cron,
 * il nuovo tick viene saltato (invece di creare concorrenza indesiderata).
 */
@ApplicationScoped
public class SparkMonitoringScheduler {

    private static final Logger LOG = Logger.getLogger(SparkMonitoringScheduler.class);

    @Inject DataprocClient        dataprocClient;
    @Inject BatchProcessRepository repository;
    @Inject NotificationService   notificationService;

    @ConfigProperty(name = "spark.monitoring.enabled",          defaultValue = "true")
    boolean monitoringEnabled;

    @ConfigProperty(name = "spark.monitoring.timeout-minutes",  defaultValue = "120")
    int timeoutMinutes;

    @ConfigProperty(name = "spark.monitoring.max-parallel",     defaultValue = "10")
    int maxParallel;

    @ConfigProperty(name = "spark.monitoring.fetch-batch-size", defaultValue = "50")
    int fetchBatchSize;

    // -------------------------------------------------------------------------

    /**
     * Tick principale - ogni 30 s, SKIP se il precedente e ancora in esecuzione.
     */
    @Scheduled(
        cron                = "${spark.monitoring.cron:0/30 * * * * ?}",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP
    )
    void pollSparkJobs() {
        if (!monitoringEnabled) {
            LOG.debug("SparkMonitoringScheduler disabilitato - skip tick");
            return;
        }
        long startMs = System.currentTimeMillis();
        LOG.infof("> Tick [%s]", java.time.Instant.now());

        try {
            // STEP 1 - Carica proiezione minima (no history, no metadataJson, ...)
            List<PollingProjection> submitted = repository.findSubmittedForPolling(fetchBatchSize);

            if (submitted.isEmpty()) {
                LOG.debug("Nessun job SPARK_SUBMITTED - tick completato.");
                return;
            }

            LOG.infof("Trovati %d job SPARK_SUBMITTED", submitted.size());
            Instant now      = Instant.now();
            var     counters = new Counters();

            // STEP 2 - Separa job scaduti da job da interrogare
            List<PollingProjection> timedOut = submitted.stream()
                .filter(p -> isTimedOut(p, now)).toList();
            List<PollingProjection> toCheck  = submitted.stream()
                .filter(p -> !isTimedOut(p, now)).toList();

            // STEP 3 - Gestione timeout (circuit-breaker logico, no GCP call)
            timedOut.forEach(p -> handleTimeout(p, counters));

            // STEP 4 - Polling GCP in parallelo con fault isolation
            pollParallel(toCheck, counters);

            LOG.infof("< Tick completato in %d ms - completed=%d failed=%d timeout=%d errors=%d",
                System.currentTimeMillis() - startMs,
                counters.completed.get(), counters.failed.get(),
                counters.timedOut.get(),  counters.errors.get());

        } catch (Exception e) {
            // Errore critico del loop principale - non blocca il prossimo tick
            LOG.errorf(e, "Errore critico in SparkMonitoringScheduler");
        }
    }

    // -- Polling parallelo -----------------------------------------------------

    private void pollParallel(List<PollingProjection> jobs, Counters counters) {
        if (jobs.isEmpty()) return;

        int threads = Math.min(maxParallel, jobs.size());
        ExecutorService exec = Executors.newFixedThreadPool(threads);
        try {
            List<CompletableFuture<Void>> futures = jobs.stream()
                .map(job -> CompletableFuture.runAsync(
                    () -> processSingleJob(job, counters), exec))
                .toList();

            // Timeout globale 25 s (< 30 s del tick -> evita sovrapposizioni)
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .get(25, TimeUnit.SECONDS);

        } catch (TimeoutException e) {
            LOG.warn("Polling GCP: timeout globale 25 s superato - alcuni job riproveranno al prossimo tick");
        } catch (Exception e) {
            LOG.warnf("Errore nel polling parallelo: %s", e.getMessage());
        } finally {
            exec.shutdownNow();
        }
    }

    // -- Singolo job (fault-isolated) ------------------------------------------

    /**
     * Processa un singolo job. Wrappato in try-catch: un'eccezione non gestita
     * viene loggata ma NON propagata - garantisce la fault isolation.
     */
    private void processSingleJob(PollingProjection job, Counters counters) {
        String pid = job.id();
        String brn = job.batchResourceName();

        try {
            if (brn == null || brn.isBlank()) {
                LOG.warnf("Job %s: batchResourceName null - skip", pid);
                return;
            }

            // Chiama GCP (con @Retry + @Timeout + @Fallback nel client)
            DataprocBatchStatus status = dataprocClient.getBatchStatus(brn);

            // Fallback attivo -> STATE_UNSPECIFIED -> non aggiornare MongoDB
            if (status.state() == DataprocBatchState.STATE_UNSPECIFIED) {
                LOG.debugf("Job %s -> STATE_UNSPECIFIED (GCP fallback) - riprova al prossimo tick", pid);
                return;
            }

            LOG.debugf("Job %s -> GCP: %s", pid, status.state());

            switch (status.state()) {

                case SUCCEEDED -> {
                    // -- COMPLETED ---------------------------------------------
                    HistoryEntry entry = new HistoryEntry(
                        BatchState.SPARK_SUBMITTED, BatchState.COMPLETED,
                        "GCP Dataproc: SUCCEEDED. BatchUUID: " + status.batchUuid());
                    if (repository.transitionToCompleted(pid, entry)) {
                        counters.completed.incrementAndGet();
                        LOG.infof("[OK] COMPLETED -> processId=%s file=%s", pid, job.fileName());
                        notificationService.sendCompletionNotification(pid, job.fileName());
                    }
                }

                case FAILED, CANCELLED, CANCELLING -> {
                    // -- FAILED ------------------------------------------------
                    String errMsg = buildErrorMsg(status);
                    HistoryEntry entry = new HistoryEntry(
                        BatchState.SPARK_SUBMITTED, BatchState.FAILED,
                        "GCP Dataproc: " + status.state() + " - " + errMsg);
                    if (repository.transitionToFailed(pid, errMsg, entry)) {
                        counters.failed.incrementAndGet();
                        LOG.warnf("[FAIL] FAILED -> processId=%s file=%s GCP=%s", pid, job.fileName(), status.state());
                        notificationService.sendFailureAlert(pid, job.fileName(), errMsg);
                    }
                }

                case PENDING, RUNNING ->
                    // In corso - nessun aggiornamento necessario
                    LOG.debugf("Job %s -> GCP %s in corso - nessuna azione", pid, status.state());

                default ->
                    LOG.warnf("Job %s -> stato GCP inatteso: %s", pid, status.state());
            }

        } catch (Exception e) {
            // Fault isolation: logga e continua
            counters.errors.incrementAndGet();
            LOG.errorf(e, "Errore non gestito per job %s (file=%s) - skip", pid, job.fileName());
        }
    }

    // -- Circuit-breaker: Timeout ----------------------------------------------

    /**
     * Verifica se il job ha superato il timeout configurato (default 2 h).
     * Confronta {@code updatedAt} con il timestamp corrente.
     */
    private boolean isTimedOut(PollingProjection job, Instant now) {
        if (job.updatedAt() == null) return false;
        return Duration.between(job.updatedAt(), now).toMinutes() >= timeoutMinutes;
    }

    /**
     * Forza la transizione a FAILED per timeout.
     * Non effettua nessuna chiamata a GCP Dataproc.
     * Invia un alert al NotificationService.
     */
    private void handleTimeout(PollingProjection job, Counters counters) {
        String pid        = job.id();
        long   ageMinutes = job.updatedAt() != null
            ? Duration.between(job.updatedAt(), Instant.now()).toMinutes()
            : timeoutMinutes;

        String errMsg = String.format(
            "Timeout Superato: job in SPARK_SUBMITTED da %d min (limite: %d min). " +
            "batchResourceName: %s",
            ageMinutes, timeoutMinutes, job.batchResourceName());

        LOG.warnf("[TIMER] TIMEOUT -> processId=%s file=%s | %d min > %d min",
            pid, job.fileName(), ageMinutes, timeoutMinutes);

        try {
            HistoryEntry entry = new HistoryEntry(
                BatchState.SPARK_SUBMITTED, BatchState.FAILED, errMsg);
            if (repository.transitionToFailed(pid, errMsg, entry)) {
                counters.timedOut.incrementAndGet();
                notificationService.sendTimeoutAlert(pid, job.fileName(), ageMinutes);
            }
        } catch (Exception e) {
            counters.errors.incrementAndGet();
            LOG.errorf(e, "Errore durante gestione timeout per job %s", pid);
        }
    }

    // -- Utility ---------------------------------------------------------------

    private String buildErrorMsg(DataprocBatchStatus s) {
        var sb = new StringBuilder("Stato GCP: ").append(s.state());
        if (s.stateMessage() != null && !s.stateMessage().isBlank())
            sb.append(" | Dettaglio: ").append(s.stateMessage());
        if (s.batchUuid() != null)
            sb.append(" | BatchUUID: ").append(s.batchUuid());
        return sb.toString();
    }

    /** Contatori thread-safe per le statistiche del tick. */
    private static class Counters {
        final AtomicInteger completed = new AtomicInteger();
        final AtomicInteger failed    = new AtomicInteger();
        final AtomicInteger timedOut  = new AtomicInteger();
        final AtomicInteger errors    = new AtomicInteger();
    }
}
