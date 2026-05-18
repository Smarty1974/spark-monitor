package com.mycompany.sparkmonitor.entity;

import java.time.LocalDateTime;

public class SparkJob {

    public Long id;
    public String jobName;
    public String applicationId;
    public String status;
    public String masterUrl;
    public String jarPath;
    public String mainClass;
    public String sparkConfig;
    public LocalDateTime startedAt;
    public LocalDateTime finishedAt;
    public Long durationMs;
    public String errorMessage;

    // Auditing
    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    // Soft delete
    public LocalDateTime deletedAt;

    public SparkJob() {}
}
