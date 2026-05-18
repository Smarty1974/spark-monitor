package com.mycompany.sparkmonitor.dto;

import com.mycompany.sparkmonitor.entity.SparkJob;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

public class SparkJobDTO {

    public Long id;

    @NotBlank
    @Size(max = 255)
    public String jobName;

    @Size(max = 100)
    public String applicationId;

    @NotBlank
    public String status;

    @NotBlank
    @Size(max = 500)
    public String masterUrl;

    @NotBlank
    @Size(max = 1000)
    public String jarPath;

    @NotBlank
    @Size(max = 500)
    public String mainClass;

    @Size(max = 5000)
    public String sparkConfig;

    public LocalDateTime startedAt;
    public LocalDateTime finishedAt;
    public Long durationMs;

    @Size(max = 5000)
    public String errorMessage;

    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkJobDTO() {}

    public static SparkJobDTO from(SparkJob e) {
        SparkJobDTO dto = new SparkJobDTO();
        dto.id            = e.id;
        dto.jobName       = e.jobName;
        dto.applicationId = e.applicationId;
        dto.status        = e.status;
        dto.masterUrl     = e.masterUrl;
        dto.jarPath       = e.jarPath;
        dto.mainClass     = e.mainClass;
        dto.sparkConfig   = e.sparkConfig;
        dto.startedAt     = e.startedAt;
        dto.finishedAt    = e.finishedAt;
        dto.durationMs    = e.durationMs;
        dto.errorMessage  = e.errorMessage;
        dto.createdAt     = e.createdAt;
        dto.updatedAt     = e.updatedAt;
        return dto;
    }

    public SparkJob toEntity() {
        SparkJob e = new SparkJob();
        e.jobName       = this.jobName;
        e.applicationId = this.applicationId;
        e.status        = this.status;
        e.masterUrl     = this.masterUrl;
        e.jarPath       = this.jarPath;
        e.mainClass     = this.mainClass;
        e.sparkConfig   = this.sparkConfig;
        e.startedAt     = this.startedAt;
        e.finishedAt    = this.finishedAt;
        e.durationMs    = this.durationMs;
        e.errorMessage  = this.errorMessage;
        return e;
    }
}
