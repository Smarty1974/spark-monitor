package com.example.sbm.scheduler;

import com.example.sbm.base.BatchProcessRepository;
import com.example.sbm.base.JobDefinitionRepository;
import com.example.sbm.client.DataprocClient;
import com.example.sbm.model.*;
import com.example.sbm.service.NotificationService;
import com.google.cloud.dataproc.v1.*;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/**
 * Launcher dei job di tipo {@link JobType#SCHEDULED}.
 *
 * <h2>Responsabilita</h2>
 * Ogni minuto scansiona tutte le {@link JobDefinition} abilitate di tipo SCHEDULED
 * e verifica se la finestra temporale e raggiunta (mediante valutazione della
 * cron expression). Se si:
 * <ol>
 *   <li>Controlla che non ci siano gia {@code maxConcurrentRuns} istanze in esecuzione.</li>
 *   <li>Crea un nuovo {@link BatchProcess} in stato {@code SCHEDULED_PENDING}.</li>
 *   <li>Sottomette il job a GCP Dataproc Serverless.</li>
 *   <li>Transiziona il processo a {@code SPARK_SUBMITTED}.</li>
 * </ol>
 *
 * Il polling dello stato GCP e delegato a {@link SparkMonitoringScheduler}
 * che gestisce tutti i processi in {@code SPARK_SUBMITTED} indipendentemente
 * dal loro tipo (SCHEDULED o FILE_DRIVEN).
 */
@ApplicationScoped
public class ScheduledJobLauncher {

    private static final Logger LOG = Logger.getLogger(ScheduledJobLauncher.class);

    @Inject JobDefinitionRepository  jobDefRepo;
    @Inject BatchProcessRepository   processRepo;
    @Inject NotificationService      notificationService;

    @ConfigProperty(name = "gcp.project-id") String projectId;
    @ConfigProperty(name = "gcp.region")     String region;

    private static final DateTimeFormatter DATE_FMT =
        DateTimeFormatter.ofPattern("yyyyMMdd");

    // -------------------------------------------------------------------------

    /**
     * Tick ogni minuto: verifica quali job SCHEDULED devono partire.
     *
     * La cron "0 * * * * ?" significa "al secondo 0 di ogni minuto".
     * La valutazione dell'orario e delegata a {@link CronEvaluator}.
     */
    @Scheduled(
        cron                = "${spark.scheduled-launcher.cron:0 * * * * ?}",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP
    )
    void checkAndLaunchScheduledJobs() {
        if (!launcherEnabled) {
            LOG.debug("ScheduledJobLauncher disabilitato - skip");
            return;
        }

        List<JobDefinition> definitions = jobDefRepo.findEnabledScheduled();
        if (definitions.isEmpty()) {
            LOG.debug("Nessuna JobDefinition SCHEDULED abilitata");
            return;
        }

        Instant now = Instant.now();
        LOG.debugf("ScheduledJobLauncher tick: %d definizioni da valutare", definitions.size());

        for (JobDefinition jd : definitions) {
            try {
                evaluateAndLaunch(jd, now);
            } catch (Exception e) {
                LOG.errorf(e, "Errore durante valutazione di JobDefinition %s (%s)",
                    jd.id, jd.name);
            }
        }
    }

    @ConfigProperty(name = "spark.scheduled-launcher.enabled", defaultValue = "true")
    boolean launcherEnabled;

    // -- Valutazione singola definizione ---------------------------------------

    private void evaluateAndLaunch(JobDefinition jd, Instant now) {
        // 1. Valuta la cron expression
        if (!CronEvaluator.shouldRunNow(jd.cronExpression, now)) {
            return; // non e ancora l'orario
        }

        LOG.infof("[TIMER] JobDefinition '%s' - orario raggiunto, verifico concorrenza", jd.name);

        // 2. Controlla esecuzioni concorrenti
        long running = processRepo.countActiveByJobDefinition(jd.id.toHexString());
        int maxConc  = jd.maxConcurrentRuns != null ? jd.maxConcurrentRuns : 1;
        if (running >= maxConc) {
            LOG.warnf("JobDefinition '%s': gia %d istanze in esecuzione (max=%d) - skip",
                jd.name, running, maxConc);
            return;
        }

        // 3. Crea il BatchProcess in SCHEDULED_PENDING
        BatchProcess bp = buildScheduledProcess(jd, now);
        processRepo.create(bp);
        String processId = bp.id.toHexString();

        LOG.infof("Creato BatchProcess %s per JobDefinition '%s' -> SCHEDULED_PENDING",
            processId, jd.name);

        // 4. Sottometti a Dataproc e transiziona a SPARK_SUBMITTED
        try {
            String batchId           = buildBatchId(jd, now);
            String batchResourceName = submitToDataproc(jd, batchId, now);

            HistoryEntry entry = new HistoryEntry(
                BatchState.SCHEDULED_PENDING,
                BatchState.SPARK_SUBMITTED,
                "Job schedulato sottomesso a GCP Dataproc. batchResourceName=" + batchResourceName
            );
            processRepo.transitionFromScheduledPendingToSubmitted(
                processId, batchResourceName, batchId, entry
            );

            LOG.infof("[OK] JobDefinition '%s' -> SPARK_SUBMITTED (batchId=%s)", jd.name, batchId);

        } catch (Exception e) {
            // Sottomissione fallita -> FAILED
            String errMsg = "Errore sottomissione a Dataproc: " + e.getMessage();
            HistoryEntry entry = new HistoryEntry(
                BatchState.SCHEDULED_PENDING, BatchState.FAILED, errMsg
            );
            processRepo.transitionToFailed(processId, errMsg, entry);
            notificationService.sendFailureAlert(processId, jd.name, errMsg);
            LOG.errorf(e, "JobDefinition '%s' -> FAILED durante sottomissione", jd.name);
        }
    }

    // -- Costruzione BatchProcess ----------------------------------------------

    private BatchProcess buildScheduledProcess(JobDefinition jd, Instant now) {
        var bp = new BatchProcess();
        bp.jobType          = JobType.SCHEDULED;
        bp.jobDefinitionId  = jd.id.toHexString();
        bp.state            = BatchState.SCHEDULED_PENDING;
        bp.scheduledAt      = now;
        bp.outputMode       = jd.outputMode;
        bp.outputBucketUri  = jd.outputBucketUri;
        bp.outputDbTarget   = jd.outputDbTarget;
        // fileName non applicabile per SCHEDULED - usiamo il nome del job
        bp.fileName         = jd.name + "_" + ZonedDateTime.now().format(DATE_FMT);
        bp.history.add(new HistoryEntry(null, BatchState.SCHEDULED_PENDING,
            "Job schedulato - orario cron raggiunto: " + jd.cronExpression));
        return bp;
    }

    private String buildBatchId(JobDefinition jd, Instant now) {
        String dateStr = ZonedDateTime.now().format(DATE_FMT);
        String safeName = jd.name.toLowerCase().replaceAll("[^a-z0-9-]", "-").substring(
            0, Math.min(jd.name.length(), 30)
        );
        return "sbm-" + safeName + "-" + dateStr + "-" + UUID.randomUUID().toString().substring(0, 6);
    }

    // -- Sottomissione GCP Dataproc --------------------------------------------

    private String submitToDataproc(JobDefinition jd, String batchId, Instant now)
        throws Exception {
        String endpoint = (jd.gcpRegion != null ? jd.gcpRegion : region)
            + "-dataproc.googleapis.com:443";
        var settings = BatchControllerSettings.newBuilder().setEndpoint(endpoint).build();

        try (var client = BatchControllerClient.create(settings)) {
            String proj   = jd.gcpProjectId != null ? jd.gcpProjectId : projectId;
            String reg    = jd.gcpRegion    != null ? jd.gcpRegion    : region;
            String parent = "projects/" + proj + "/locations/" + reg;
            String dateStr= ZonedDateTime.now().format(DATE_FMT);

            // Risolvi i placeholder negli argomenti Spark
            List<String> resolvedArgs = resolveArguments(jd, dateStr, null);

            var pysparkConfig = PySparkBatch.newBuilder()
                .setMainPythonFileUri(jd.sparkMainScript != null
                    ? jd.sparkMainScript
                    : "gs://sbm-scripts/default_scheduled.py")
                .addAllArgs(resolvedArgs)
                .build();

            var runtimeConfig = RuntimeConfig.newBuilder()
                .setVersion(jd.sparkVersion != null ? jd.sparkVersion : "3.5")
                .putProperties("spark.executor.memory",
                    jd.executorMemory != null ? jd.executorMemory : "4g")
                .putProperties("spark.executor.cores",
                    String.valueOf(jd.executorCores != null ? jd.executorCores : 2))
                .build();

            var batch = Batch.newBuilder()
                .setPysparkBatch(pysparkConfig)
                .setRuntimeConfig(runtimeConfig)
                .build();

            client.createBatchAsync(CreateBatchRequest.newBuilder()
                .setParent(parent).setBatch(batch).setBatchId(batchId).build());

            return parent + "/batches/" + batchId;
        }
    }

    private List<String> resolveArguments(JobDefinition jd, String dateStr, String fileName) {
        if (jd.sparkArguments == null) return List.of();
        return jd.sparkArguments.stream()
            .map(arg -> arg
                .replace("{date}",          dateStr)
                .replace("{outputBucketUri}", jd.outputBucketUri != null ? jd.outputBucketUri : "")
                .replace("{outputDbTarget}",  jd.outputDbTarget  != null ? jd.outputDbTarget  : "")
                .replace("{inputFile}",       fileName           != null ? fileName            : "")
            ).toList();
    }
}
