package com.mycompany.sparkmonitor.dto;

public class DashboardKpiDTO {

    public long   runningJobs;
    public long   failedToday;
    public Double avgDurationMs;   // null se nessuna esecuzione nelle 24h
    public long   activeSchedules;

    public DashboardKpiDTO() {}

    public DashboardKpiDTO(long runningJobs, long failedToday,
                           Double avgDurationMs, long activeSchedules) {
        this.runningJobs     = runningJobs;
        this.failedToday     = failedToday;
        this.avgDurationMs   = avgDurationMs;
        this.activeSchedules = activeSchedules;
    }
}
