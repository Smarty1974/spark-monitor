package com.mycompany.sparkmonitor.entity;

import java.time.LocalDateTime;

public class SparkJobExecution {

    public Long id;
    public Long sparkJobId;
    public Integer executionNumber;
    public String status;
    public LocalDateTime startedAt;
    public LocalDateTime finishedAt;
    public Long durationMs;
    public Long recordsRead;
    public Long recordsWritten;
    public String errorMessage;
    public String sparkUiUrl;
    public String logsPath;

    // Auditing
    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkJobExecution() {}
}
