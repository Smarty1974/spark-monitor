package com.mycompany.sparkmonitor.dto;

import com.mycompany.sparkmonitor.entity.SparkSchedule;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

public class SparkScheduleDTO {

    public Long id;

    @NotNull
    public Long sparkJobId;

    @NotBlank
    @Size(max = 255)
    public String scheduleName;

    @NotBlank
    @Size(max = 100)
    public String cronExpr;

    @NotNull
    public Boolean enabled;

    @Size(max = 1000)
    public String description;

    public LocalDateTime lastRunAt;
    public LocalDateTime nextRunAt;

    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;

    public SparkScheduleDTO() {}

    public static SparkScheduleDTO from(SparkSchedule e) {
        SparkScheduleDTO dto = new SparkScheduleDTO();
        dto.id           = e.id;
        dto.sparkJobId   = e.sparkJobId;
        dto.scheduleName = e.scheduleName;
        dto.cronExpr     = e.cronExpr;
        dto.enabled      = e.enabled;
        dto.description  = e.description;
        dto.lastRunAt    = e.lastRunAt;
        dto.nextRunAt    = e.nextRunAt;
        dto.createdAt    = e.createdAt;
        dto.updatedAt    = e.updatedAt;
        return dto;
    }

    public SparkSchedule toEntity() {
        SparkSchedule e = new SparkSchedule();
        e.sparkJobId   = this.sparkJobId;
        e.scheduleName = this.scheduleName;
        e.cronExpr     = this.cronExpr;
        e.enabled      = this.enabled;
        e.description  = this.description;
        e.lastRunAt    = this.lastRunAt;
        e.nextRunAt    = this.nextRunAt;
        return e;
    }
}
