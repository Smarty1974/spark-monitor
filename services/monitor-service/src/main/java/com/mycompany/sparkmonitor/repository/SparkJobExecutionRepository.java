package com.mycompany.sparkmonitor.repository;

import com.mycompany.sparkmonitor.entity.SparkJobExecution;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import javax.sql.DataSource;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;

@ApplicationScoped
public class SparkJobExecutionRepository {

    @Inject DataSource dataSource;

    private static final String TABLE = "spark_job_executions";
    private static final Set<String> SORTABLE = Set.of(
        "id", "execution_number", "status", "started_at", "finished_at", "duration_ms", "created_at"
    );

    public List<SparkJobExecution> findAll(int page, int size, String sort, String order) {
        String sql = "SELECT * FROM " + TABLE
            + " ORDER BY " + safe(sort, SORTABLE) + " " + safeOrder(order)
            + " LIMIT ? OFFSET ?";
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setInt(1, size);
            ps.setInt(2, page * size);
            return map(ps.executeQuery());
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public long count() {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement("SELECT COUNT(*) FROM " + TABLE);
             var rs = ps.executeQuery()) {
            return rs.next() ? rs.getLong(1) : 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Optional<SparkJobExecution> findById(Long id) {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement("SELECT * FROM " + TABLE + " WHERE id=?")) {
            ps.setLong(1, id);
            var list = map(ps.executeQuery());
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public List<SparkJobExecution> findBySparkJobId(Long sparkJobId, int page, int size) {
        String sql = "SELECT * FROM " + TABLE
            + " WHERE spark_job_id=? ORDER BY execution_number DESC LIMIT ? OFFSET ?";
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, sparkJobId);
            ps.setInt(2, size);
            ps.setInt(3, page * size);
            return map(ps.executeQuery());
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public SparkJobExecution create(SparkJobExecution entity) {
        String sql = """
            INSERT INTO spark_job_executions
              (spark_job_id, execution_number, status, started_at, finished_at, duration_ms,
               records_read, records_written, error_message, spark_ui_url, logs_path)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, entity.sparkJobId);
            ps.setInt(2, entity.executionNumber);
            ps.setString(3, entity.status);
            ps.setObject(4, entity.startedAt);
            ps.setObject(5, entity.finishedAt);
            if (entity.durationMs   != null) ps.setLong(6, entity.durationMs);   else ps.setNull(6, Types.BIGINT);
            if (entity.recordsRead  != null) ps.setLong(7, entity.recordsRead);  else ps.setNull(7, Types.BIGINT);
            if (entity.recordsWritten != null) ps.setLong(8, entity.recordsWritten); else ps.setNull(8, Types.BIGINT);
            ps.setString(9, entity.errorMessage);
            ps.setString(10, entity.sparkUiUrl);
            ps.setString(11, entity.logsPath);
            return map(ps.executeQuery()).get(0);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Optional<SparkJobExecution> update(Long id, SparkJobExecution entity) {
        String sql = """
            UPDATE spark_job_executions SET
              spark_job_id=?, execution_number=?, status=?, started_at=?, finished_at=?,
              duration_ms=?, records_read=?, records_written=?, error_message=?,
              spark_ui_url=?, logs_path=?, updated_at=NOW()
            WHERE id=?
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, entity.sparkJobId);
            ps.setInt(2, entity.executionNumber);
            ps.setString(3, entity.status);
            ps.setObject(4, entity.startedAt);
            ps.setObject(5, entity.finishedAt);
            if (entity.durationMs   != null) ps.setLong(6, entity.durationMs);   else ps.setNull(6, Types.BIGINT);
            if (entity.recordsRead  != null) ps.setLong(7, entity.recordsRead);  else ps.setNull(7, Types.BIGINT);
            if (entity.recordsWritten != null) ps.setLong(8, entity.recordsWritten); else ps.setNull(8, Types.BIGINT);
            ps.setString(9, entity.errorMessage);
            ps.setString(10, entity.sparkUiUrl);
            ps.setString(11, entity.logsPath);
            ps.setLong(12, id);
            var list = map(ps.executeQuery());
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public boolean delete(Long id) {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement("DELETE FROM " + TABLE + " WHERE id=?")) {
            ps.setLong(1, id);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private List<SparkJobExecution> map(ResultSet rs) throws SQLException {
        List<SparkJobExecution> list = new ArrayList<>();
        while (rs.next()) {
            var e = new SparkJobExecution();
            e.id              = rs.getLong("id");
            e.sparkJobId      = rs.getLong("spark_job_id");
            e.executionNumber = rs.getInt("execution_number");
            e.status          = rs.getString("status");
            e.startedAt       = rs.getObject("started_at",       LocalDateTime.class);
            e.finishedAt      = rs.getObject("finished_at",      LocalDateTime.class);
            e.durationMs      = rs.getObject("duration_ms",      Long.class);
            e.recordsRead     = rs.getObject("records_read",     Long.class);
            e.recordsWritten  = rs.getObject("records_written",  Long.class);
            e.errorMessage    = rs.getString("error_message");
            e.sparkUiUrl      = rs.getString("spark_ui_url");
            e.logsPath        = rs.getString("logs_path");
            e.createdAt       = rs.getObject("created_at",       LocalDateTime.class);
            e.updatedAt       = rs.getObject("updated_at",       LocalDateTime.class);
            list.add(e);
        }
        return list;
    }

    private String safe(String val, Set<String> allowed) {
        return allowed.contains(val) ? val : "id";
    }

    private String safeOrder(String order) {
        return "desc".equalsIgnoreCase(order) ? "DESC" : "ASC";
    }
}
