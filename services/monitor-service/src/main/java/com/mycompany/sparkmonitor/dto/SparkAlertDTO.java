package com.mycompany.sparkmonitor.dto;

import com.mycompany.sparkmonitor.entity.SparkAlert;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

public class SparkAlertDTO {

    public Long id;

    public Long sparkJobId;

    @NotBlank
    @Size(max = 100)
    public String alertType;

    @NotBlank
    public String severity;

    @NotBlank
    @Size(max = 2000)
    public String message;

    @NotNull
    public Boolean resolved;

    public LocalDateTime resolvedAt;

    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkAlertDTO() {}

    public static SparkAlertDTO from(SparkAlert e) {
        SparkAlertDTO dto = new SparkAlertDTO();
        dto.id         = e.id;
        dto.sparkJobId = e.sparkJobId;
        dto.alertType  = e.alertType;
        dto.severity   = e.severity;
        dto.message    = e.message;
        dto.resolved   = e.resolved;
        dto.resolvedAt = e.resolvedAt;
        dto.createdAt  = e.createdAt;
        dto.updatedAt  = e.updatedAt;
        return dto;
    }

    public SparkAlert toEntity() {
        SparkAlert e = new SparkAlert();
        e.sparkJobId = this.sparkJobId;
        e.alertType  = this.alertType;
        e.severity   = this.severity;
        e.message    = this.message;
        e.resolved   = this.resolved;
        e.resolvedAt = this.resolvedAt;
        return e;
    }
}
