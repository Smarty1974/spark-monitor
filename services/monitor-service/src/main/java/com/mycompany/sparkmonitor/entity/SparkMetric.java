package com.mycompany.sparkmonitor.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class SparkMetric {

    public Long id;
    public Long executionId;
    public String metricName;
    public BigDecimal metricValue;
    public String metricUnit;
    public LocalDateTime recordedAt;
    public String stage;

    // Auditing
    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkMetric() {}
}
