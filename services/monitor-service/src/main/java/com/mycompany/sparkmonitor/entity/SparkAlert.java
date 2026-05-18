package com.mycompany.sparkmonitor.entity;

import java.time.LocalDateTime;

public class SparkAlert {

    public Long id;
    public Long sparkJobId;
    public String alertType;
    public String severity;
    public String message;
    public Boolean resolved;
    public LocalDateTime resolvedAt;

    // Auditing
    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkAlert() {}
}
