package com.example.sbm.model;

import org.bson.types.ObjectId;
import java.time.Instant;
import java.util.List;

/**
 * Documento MongoDB: collection {@code job_definitions}.
 *
 * Rappresenta un <em>template</em> di job Spark riutilizzabile.
 * Ogni esecuzione concreta genera un {@link BatchProcess} figlio
 * che fa riferimento a questa definizione tramite {@code jobDefinitionId}.
 *
 * <h3>Differenza con BucketConfig</h3>
 * {@code BucketConfig} descrive <em>dove</em> leggere i file in input.
 * {@code JobDefinition} descrive <em>cosa fa</em> il job, <em>come</em>
 * viene avviato e <em>dove</em> scrive l'output.
 */
public class JobDefinition {

    public ObjectId   id;

    // -- Identificazione -------------------------------------------------------

    /** Nome univoco del job (es. "report-vendite-giornaliero"). */
    public String     name;

    /** Descrizione estesa del job e del suo scopo. */
    public String     description;

    /** Tipo di job: SCHEDULED (cron) o FILE_DRIVEN (bucket event). */
    public JobType    jobType;

    /** Categoria funzionale (es. "reporting", "etl", "anagrafica"). */
    public String     category;

    // -- Trigger ----------------------------------------------------------------

    /**
     * Solo per {@link JobType#SCHEDULED}.
     * Espressione cron che definisce l'orario di avvio.
     * Formato Quarkus Scheduler: {@code "0 0 2 * * ?"} = ogni giorno alle 02:00.
     * Puo contenere piu espressioni separate da virgola per finestre multiple.
     * Esempio: "0 0 2,14 * * ?" = alle 02:00 e alle 14:00.
     */
    public String     cronExpression;

    /**
     * Solo per {@link JobType#FILE_DRIVEN}.
     * URI del bucket sorgente da monitorare (GCS: "gs://..." | S3: "s3://...").
     */
    public String     inputBucketUri;

    /**
     * Solo per {@link JobType#FILE_DRIVEN}.
     * Pattern glob dei file che attivano il job (es. "*.parquet", "data_*.csv").
     */
    public String     filePattern;

    // -- Output -----------------------------------------------------------------

    /** Modalita di output: BUCKET_WRITE | DATABASE_UPDATE | BUCKET_AND_DATABASE. */
    public OutputMode outputMode;

    /**
     * URI del bucket di destinazione per l'output.
     * Valorizzato se {@code outputMode} e BUCKET_WRITE o BUCKET_AND_DATABASE.
     * Esempio: "gs://my-output-bucket/reports/"
     */
    public String     outputBucketUri;

    /**
     * Tipo di database target per l'aggiornamento.
     * Valorizzato se {@code outputMode} e DATABASE_UPDATE o BUCKET_AND_DATABASE.
     * Esempio: "BigQuery", "PostgreSQL", "MongoDB", "Spanner".
     */
    public String     outputDbType;

    /**
     * Dataset/schema/collection target nel database.
     * Esempio: "analytics.daily_sales" (BigQuery) | "public.orders" (PostgreSQL).
     */
    public String     outputDbTarget;

    /**
     * Modalita di scrittura nel database.
     * Valori tipici: "OVERWRITE", "APPEND", "UPSERT", "MERGE".
     */
    public String     outputWriteMode;

    // -- Parametri GCP Dataproc ------------------------------------------------

    /** Progetto GCP su cui eseguire il batch. */
    public String     gcpProjectId;

    /** Regione GCP Dataproc Serverless. */
    public String     gcpRegion;

    /**
     * Template del resource name del batch Dataproc.
     * Puo contenere placeholder: {@code {jobId}}, {@code {date}}, {@code {fileName}}.
     * Esempio: "projects/my-proj/locations/europe-west1/batches/report-{date}"
     */
    public String     dataprocBatchTemplate;

    /**
     * URI dello script PySpark o del JAR da eseguire.
     * Esempio: "gs://scripts-bucket/jobs/report_giornaliero.py"
     */
    public String     sparkMainScript;

    /**
     * Argomenti da passare al job Spark come lista di stringhe.
     * Possono contenere placeholder: {@code {date}}, {@code {inputFile}}, {@code {outputPath}}.
     * Esempio: ["--date={date}", "--output={outputBucketUri}"]
     */
    public List<String> sparkArguments;

    /**
     * Versione Spark da usare su Dataproc Serverless.
     * Default: "3.5"
     */
    public String     sparkVersion;

    /**
     * Dimensione della memoria per ogni executor Spark.
     * Default: "4g"
     */
    public String     executorMemory;

    /**
     * Numero di core per ogni executor.
     * Default: "2"
     */
    public Integer    executorCores;

    // -- Comportamento ---------------------------------------------------------

    /** Se true, il job viene avviato automaticamente secondo il trigger configurato. */
    public Boolean    enabled;

    /**
     * Numero massimo di istanze concorrenti di questo job.
     * Se il job precedente e ancora in esecuzione quando scatta il trigger,
     * il nuovo avvio viene saltato (se maxConcurrentRuns = 1).
     */
    public Integer    maxConcurrentRuns;

    /**
     * Timeout in minuti prima che il job venga forzato a FAILED.
     * Se null, usa il default globale (120 min).
     */
    public Integer    timeoutMinutes;

    /**
     * Numero di tentativi automatici in caso di FAILED.
     * 0 = nessun retry automatico (richiede intervento manuale).
     */
    public Integer    maxRetries;

    /**
     * Attesa in minuti tra un retry e il successivo.
     * Default: 5 minuti.
     */
    public Integer    retryDelayMinutes;

    // -- Notifiche -------------------------------------------------------------

    /**
     * Lista di indirizzi email da notificare su FAILED.
     * Il {@link com.example.sbm.service.NotificationService} li usa se configurato.
     */
    public List<String> alertEmails;

    /**
     * Webhook Slack/Teams da chiamare su FAILED o COMPLETED.
     */
    public String     webhookUrl;

    // -- Metadati --------------------------------------------------------------

    /** Tag liberi per raggruppamento e filtering (es. ["etl","vendite","daily"]). */
    public List<String> tags;

    /** Team o sistema proprietario di questo job. */
    public String     owner;

    public Instant    createdAt;
    public Instant    updatedAt;

    public JobDefinition() {}
}
