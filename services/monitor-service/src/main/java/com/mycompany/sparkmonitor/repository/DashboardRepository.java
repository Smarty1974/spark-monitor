package com.mycompany.sparkmonitor.repository;

import com.mycompany.sparkmonitor.dto.DashboardKpiDTO;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import javax.sql.DataSource;
import java.sql.*;

@ApplicationScoped
public class DashboardRepository {

    @Inject DataSource dataSource;

    /**
     * Calcola i 4 KPI della dashboard in query separate ottimizzate.
     */
    public DashboardKpiDTO getKpi() {
        try (Connection conn = dataSource.getConnection()) {
            long runningJobs     = countRunningJobs(conn);
            long failedToday     = countFailedToday(conn);
            Double avgDurationMs = avgDurationLast24h(conn);
            long activeSchedules = countActiveSchedules(conn);
            return new DashboardKpiDTO(runningJobs, failedToday, avgDurationMs, activeSchedules);
        } catch (SQLException e) {
            throw new RuntimeException("Errore calcolo KPI dashboard", e);
        }
    }

    /** 1. Job con status = 'RUNNING' e non cancellati */
    private long countRunningJobs(Connection conn) throws SQLException {
        String sql = "SELECT COUNT(*) FROM spark_jobs WHERE status = 'RUNNING' AND deleted_at IS NULL";
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            return rs.next() ? rs.getLong(1) : 0;
        }
    }

    /** 2. Job con status = 'FAILED' avviati da mezzanotte di oggi */
    private long countFailedToday(Connection conn) throws SQLException {
        String sql = """
            SELECT COUNT(*) FROM spark_jobs
            WHERE status = 'FAILED'
              AND deleted_at IS NULL
              AND started_at >= CURRENT_DATE
            """;
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            return rs.next() ? rs.getLong(1) : 0;
        }
    }

    /** 3. Media durata (ms) delle esecuzioni SUCCEEDED nelle ultime 24 ore */
    private Double avgDurationLast24h(Connection conn) throws SQLException {
        String sql = """
            SELECT AVG(duration_ms)
            FROM spark_job_executions
            WHERE status = 'SUCCEEDED'
              AND duration_ms IS NOT NULL
              AND finished_at >= NOW() - INTERVAL '24 hours'
            """;
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                double val = rs.getDouble(1);
                return rs.wasNull() ? null : val;
            }
            return null;
        }
    }

    /** 4. Schedule attive (enabled = true, non cancellate) */
    private long countActiveSchedules(Connection conn) throws SQLException {
        String sql = """
            SELECT COUNT(*) FROM spark_schedules
            WHERE enabled = TRUE AND deleted_at IS NULL
            """;
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            return rs.next() ? rs.getLong(1) : 0;
        }
    }
}
