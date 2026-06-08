package com.example.sbm.model;

import org.bson.types.ObjectId;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Documento MongoDB: collection {@code batch_processes}.
 *
 * Rappresenta una <em>singola esecuzione</em> di un job Spark.
 * Ogni esecuzione ha un proprio ciclo di vita tracciato dalla state machine.
 *
 * <p>Puo essere creato da:
 * <ul>
 *   <li>{@code GcsTriggerResource} - file arrivato nel bucket (FILE_DRIVEN)</li>
 *   <li>{@code ScheduledJobLauncher} - scattato il cron (SCHEDULED)</li>
 *   <li>API manuale - avvio da frontend o CI/CD</li>
 * </ul>
 */
public class BatchProcess {

    public ObjectId   id;

    // -- Classificazione -------------------------------------------------------

    /** Tipo di job: FILE_DRIVEN o SCHEDULED. */
    public JobType    jobType;

    /**
     * Riferimento alla {@link JobDefinition} che ha generato questa esecuzione.
     * Null per elaborazioni ad-hoc create manualmente.
     */
    public String     jobDefinitionId;

    // -- Input (FILE_DRIVEN) ---------------------------------------------------

    /** Nome del file che ha attivato il job (solo FILE_DRIVEN). */
    public String     fileName;

    /** Bucket sorgente (GCS: "gs://..." | S3: "s3://..."). */
    public String     bucketUri;

    /** Dimensione del file in byte (se disponibile). */
    public Long       fileSizeBytes;

    // -- Output -----------------------------------------------------------------

    /** Modalita output: BUCKET_WRITE | DATABASE_UPDATE | BUCKET_AND_DATABASE. */
    public OutputMode outputMode;

    /** URI bucket di output (BUCKET_WRITE / BUCKET_AND_DATABASE). */
    public String     outputBucketUri;

    /** Percorso/file specifico scritto nell'output bucket (valorizzato dopo COMPLETED). */
    public String     outputPath;

    /** Database target aggiornato (DATABASE_UPDATE / BUCKET_AND_DATABASE). */
    public String     outputDbTarget;

    /** Numero di record scritti o aggiornati (valorizzato dopo COMPLETED). */
    public Long       outputRecordCount;

    // -- GCP Dataproc ----------------------------------------------------------

    /**
     * Resource name GCP del batch Dataproc.
     * Formato: {@code projects/{proj}/locations/{region}/batches/{id}}
     */
    public String     batchResourceName;

    /** ID breve del batch (usato come label in Dataproc). */
    public String     sparkJobId;

    // -- Scheduling (SCHEDULED) ------------------------------------------------

    /**
     * Data/ora in cui il job era pianificato per questa esecuzione.
     * Valorizzato dallo {@code ScheduledJobLauncher}.
     */
    public Instant    scheduledAt;

    /**
     * Data/ora effettiva di avvio (sottomissione a Dataproc).
     */
    public Instant    startedAt;

    /**
     * Data/ora di completamento (COMPLETED o FAILED).
     */
    public Instant    finishedAt;

    // -- State machine ---------------------------------------------------------

    /** Stato corrente nella macchina a stati. */
    public BatchState state;

    /** Dettaglio del fallimento (se state == FAILED). */
    public String     errorMessage;

    /** Numero di tentativi effettuati (per retry automatici). */
    public Integer    retryCount;

    /** Storia completa delle transizioni di stato. */
    public List<HistoryEntry> history = new ArrayList<>();

    // -- Metadati --------------------------------------------------------------

    /** Configurazione bucket associata (per FILE_DRIVEN). */
    public String     bucketConfigId;

    /** Metadati aggiuntivi JSON liberi. */
    public String     metadataJson;

    public Instant    createdAt;
    public Instant    updatedAt;

    public BatchProcess() {}
}
