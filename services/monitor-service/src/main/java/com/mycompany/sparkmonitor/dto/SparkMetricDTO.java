package com.mycompany.sparkmonitor.dto;

import com.mycompany.sparkmonitor.entity.SparkMetric;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public class SparkMetricDTO {

    public Long id;

    @NotNull
    public Long executionId;

    @NotBlank
    @Size(max = 255)
    public String metricName;

    @NotNull
    public BigDecimal metricValue;

    @Size(max = 50)
    public String metricUnit;

    @NotNull
    public LocalDateTime recordedAt;

    @Size(max = 100)
    public String stage;

    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkMetricDTO() {}

    public static SparkMetricDTO from(SparkMetric e) {
        SparkMetricDTO dto = new SparkMetricDTO();
        dto.id          = e.id;
        dto.executionId = e.executionId;
        dto.metricName  = e.metricName;
        dto.metricValue = e.metricValue;
        dto.metricUnit  = e.metricUnit;
        dto.recordedAt  = e.recordedAt;
        dto.stage       = e.stage;
        dto.createdAt   = e.createdAt;
        dto.updatedAt   = e.updatedAt;
        return dto;
    }

    public SparkMetric toEntity() {
        SparkMetric e = new SparkMetric();
        e.executionId = this.executionId;
        e.metricName  = this.metricName;
        e.metricValue = this.metricValue;
        e.metricUnit  = this.metricUnit;
        e.recordedAt  = this.recordedAt;
        e.stage       = this.stage;
        return e;
    }
}
