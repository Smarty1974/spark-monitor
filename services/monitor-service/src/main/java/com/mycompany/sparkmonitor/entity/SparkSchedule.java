package com.mycompany.sparkmonitor.entity;

import java.time.LocalDateTime;

public class SparkSchedule {

    public Long id;
    public Long sparkJobId;
    public String scheduleName;
    public String cronExpr;
    public Boolean enabled;
    public String description;
    public LocalDateTime lastRunAt;
    public LocalDateTime nextRunAt;

    // Auditing
    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    // Soft delete
    public LocalDateTime deletedAt;

    public SparkSchedule() {}
}
