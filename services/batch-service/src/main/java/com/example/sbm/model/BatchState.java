package com.example.sbm.model;

/**
 * Macchina a stati unificata per tutti i tipi di job Spark.
 *
 * <pre>
 * ===================================================================
 *  JOB TIPO FILE_DRIVEN (trigger: arrivo file su bucket)
 * ===================================================================
 *
 *  FILE_RECEIVED                     <- file arrivato nel bucket
 *       |  GcsTriggerResource
 *       v
 *  SPARK_SUBMITTED <-- polling 30s   <- job inviato a Dataproc
 *       |
 *       +--> COMPLETED               <- GCP: SUCCEEDED
 *       +--> FAILED                  <- GCP: FAILED/CANCELLED, timeout 2h
 *
 *  FAILED --> FILE_RECEIVED          <- resubmit manuale
 *
 * ===================================================================
 *  JOB TIPO SCHEDULED (trigger: cron orario)
 * ===================================================================
 *
 *  SCHEDULED_PENDING                 <- finestra temporale raggiunta,
 *       |  ScheduledJobLauncher           job ancora da avviare
 *       v
 *  SPARK_SUBMITTED <-- polling 30s   <- job inviato a Dataproc
 *       |
 *       +--> COMPLETED               <- GCP: SUCCEEDED
 *       +--> FAILED                  <- GCP: FAILED/CANCELLED, timeout
 *
 *  FAILED --> SCHEDULED_PENDING      <- retry automatico (configurabile)
 *
 * ===================================================================
 * </pre>
 */
public enum BatchState {

    // -- Stati FILE_DRIVEN ----------------------------------------------------

    /**
     * File ricevuto nel bucket (GCS o S3).
     * Il job Spark non e ancora stato sottomesso a Dataproc.
     * Applicabile solo a: {@link JobType#FILE_DRIVEN}.
     */
    FILE_RECEIVED,

    // -- Stati SCHEDULED ------------------------------------------------------

    /**
     * La finestra temporale del job schedulato e stata raggiunta.
     * Il job e in coda per essere avviato da {@code ScheduledJobLauncher}.
     * Applicabile solo a: {@link JobType#SCHEDULED}.
     */
    SCHEDULED_PENDING,

    // -- Stato comune (entrambi i tipi) ---------------------------------------

    /**
     * Il job Spark e stato sottomesso a GCP Dataproc Serverless.
     * Il campo {@code batchResourceName} contiene il resource name GCP.
     * Monitorato dallo scheduler di polling ogni 30 secondi.
     * Applicabile a: entrambi i tipi.
     */
    SPARK_SUBMITTED,

    // -- Stati terminali (entrambi i tipi) ------------------------------------

    /**
     * Il job si e concluso con successo.
     * Per job FILE_DRIVEN: il file e stato elaborato.
     * Per job SCHEDULED: l'output e stato scritto sul bucket / DB aggiornato.
     * Stato terminale (non cambia piu a meno di resubmit).
     */
    COMPLETED,

    /**
     * Il job e fallito per errore GCP, cancellazione o timeout.
     * Il campo {@code errorMessage} descrive la causa.
     * Stato terminale (puo essere rilanciato manualmente).
     */
    FAILED
}
