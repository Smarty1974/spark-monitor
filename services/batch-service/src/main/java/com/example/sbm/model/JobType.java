package com.example.sbm.model;

/**
 * Tipo di job Spark gestito dalla state machine.
 *
 * <pre>
 *  SCHEDULED   - job schedulato a orario fisso (cron), senza file in input.
 *                Scrive output su bucket GCS/S3.
 *                Esempio: report giornaliero delle 02:00, aggregazioni settimanali.
 *
 *  FILE_DRIVEN - job attivato dall'arrivo di un file su bucket (GCS/S3).
 *                Legge il file in input, aggiorna DB o scrive dataset in output.
 *                Esempio: elaborazione transazioni, caricamento anagrafica.
 * </pre>
 */
public enum JobType {

    /**
     * Job a trigger temporale (cron).
     * Non ha file in input; parte all'orario configurato e scrive output
     * su bucket. Il campo {@code cronExpression} di {@link JobDefinition}
     * ne definisce la periodicita.
     */
    SCHEDULED,

    /**
     * Job a trigger file (bucket event).
     * Parte quando arriva un file nel bucket configurato.
     * Il campo {@code inputBucketUri} indica il bucket sorgente;
     * {@code outputBucketUri} il bucket di destinazione dell'output.
     */
    FILE_DRIVEN
}
