package com.example.sbm.client;

/**
 * Risposta normalizzata del client GCP Dataproc.
 *
 * @param state        stato attuale del batch
 * @param stateMessage messaggio di stato (presente se FAILED/CANCELLED)
 * @param batchUuid    UUID interno GCP del batch
 */
public record DataprocBatchStatus(
    DataprocBatchState state,
    String             stateMessage,
    String             batchUuid
) {
    /** True se il batch e in uno stato terminale (non cambiera piu). */
    public boolean isTerminal() {
        return state == DataprocBatchState.SUCCEEDED
            || state == DataprocBatchState.FAILED
            || state == DataprocBatchState.CANCELLED;
    }
}
