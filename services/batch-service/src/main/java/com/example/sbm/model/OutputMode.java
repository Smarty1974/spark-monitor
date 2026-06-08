package com.example.sbm.model;

/**
 * Modalita di output del job Spark.
 *
 * Indica cosa fa il job una volta elaborato l'input.
 */
public enum OutputMode {

    /** Scrive uno o piu file (Parquet, CSV, JSON...) su un bucket GCS/S3. */
    BUCKET_WRITE,

    /**
     * Aggiorna/inserisce record in un database (BigQuery, PostgreSQL,
     * MongoDB, Spanner...). Nessun file di output sul bucket.
     */
    DATABASE_UPDATE,

    /**
     * Fa entrambe le cose: scrive un dataset sul bucket E aggiorna
     * il database (es. snapshot + upsert anagrafica).
     */
    BUCKET_AND_DATABASE
}
