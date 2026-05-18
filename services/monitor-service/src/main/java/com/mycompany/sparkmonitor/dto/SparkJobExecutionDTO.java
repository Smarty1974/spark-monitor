package com.mycompany.sparkmonitor.dto;

import com.mycompany.sparkmonitor.entity.SparkJobExecution;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

public class SparkJobExecutionDTO {

    public Long id;

    @NotNull
    public Long sparkJobId;

    @NotNull
    public Integer executionNumber;

    @NotBlank
    public String status;

    public LocalDateTime startedAt;
    public LocalDateTime finishedAt;
    public Long durationMs;
    public Long recordsRead;
    public Long recordsWritten;

    @Size(max = 5000)
    public String errorMessage;

    @Size(max = 500)
    public String sparkUiUrl;

    @Size(max = 1000)
    public String logsPath;

    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkJobExecutionDTO() {}

    public static SparkJobExecutionDTO from(SparkJobExecution e) {
        SparkJobExecutionDTO dto = new SparkJobExecutionDTO();
        dto.id              = e.id;
        dto.sparkJobId      = e.sparkJobId;
        dto.executionNumber = e.executionNumber;
        dto.status          = e.status;
        dto.startedAt       = e.startedAt;
        dto.finishedAt      = e.finishedAt;
        dto.durationMs      = e.durationMs;
        dto.recordsRead     = e.recordsRead;
        dto.recordsWritten  = e.recordsWritten;
        dto.errorMessage    = e.errorMessage;
        dto.sparkUiUrl      = e.sparkUiUrl;
        dto.logsPath        = e.logsPath;
        dto.createdAt       = e.createdAt;
        dto.updatedAt       = e.updatedAt;
        return dto;
    }

    public SparkJobExecution toEntity() {
        SparkJobExecution e = new SparkJobExecution();
        e.sparkJobId      = this.sparkJobId;
        e.executionNumber = this.executionNumber;
        e.status          = this.status;
        e.startedAt       = this.startedAt;
        e.finishedAt      = this.finishedAt;
        e.durationMs      = this.durationMs;
        e.recordsRead     = this.recordsRead;
        e.recordsWritten  = this.recordsWritten;
        e.errorMessage    = this.errorMessage;
        e.sparkUiUrl      = this.sparkUiUrl;
        e.logsPath        = this.logsPath;
        return e;
    }
}
