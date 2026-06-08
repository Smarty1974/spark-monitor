package com.example.sbm.client;

/**
 * Stati del ciclo di vita Batch GCP Dataproc Serverless.
 * Fonte: https://cloud.google.com/dataproc/docs/reference/rest/v1/projects.locations.batches#State
 */
public enum DataprocBatchState {
    STATE_UNSPECIFIED,
    PENDING,
    RUNNING,
    CANCELLING,
    CANCELLED,
    SUCCEEDED,
    FAILED
}
