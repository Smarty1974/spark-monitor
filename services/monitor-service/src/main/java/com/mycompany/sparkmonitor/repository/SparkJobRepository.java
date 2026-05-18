package com.mycompany.sparkmonitor.repository;

import com.mycompany.sparkmonitor.entity.SparkJob;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import javax.sql.DataSource;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;

@ApplicationScoped
public class SparkJobRepository {

    @Inject DataSource dataSource;

    private static final String TABLE = "spark_jobs";
    private static final Set<String> SORTABLE = Set.of(
        "id", "job_name", "status", "started_at", "finished_at", "duration_ms", "created_at"
    );

    public List<SparkJob> findAll(int page, int size, String sort, String order) {
        String sql = "SELECT * FROM " + TABLE
            + " WHERE deleted_at IS NULL"
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
             var ps = conn.prepareStatement("SELECT COUNT(*) FROM " + TABLE + " WHERE deleted_at IS NULL");
             var rs = ps.executeQuery()) {
            return rs.next() ? rs.getLong(1) : 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Optional<SparkJob> findById(Long id) {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(
                 "SELECT * FROM " + TABLE + " WHERE id=? AND deleted_at IS NULL")) {
            ps.setLong(1, id);
            var list = map(ps.executeQuery());
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public SparkJob create(SparkJob entity) {
        String sql = """
            INSERT INTO spark_jobs
              (job_name, application_id, status, master_url, jar_path, main_class,
               spark_config, started_at, finished_at, duration_ms, error_message)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setString(1, entity.jobName);
            ps.setString(2, entity.applicationId);
            ps.setString(3, entity.status);
            ps.setString(4, entity.masterUrl);
            ps.setString(5, entity.jarPath);
            ps.setString(6, entity.mainClass);
            ps.setString(7, entity.sparkConfig);
            ps.setObject(8, entity.startedAt);
            ps.setObject(9, entity.finishedAt);
            if (entity.durationMs != null) ps.setLong(10, entity.durationMs); else ps.setNull(10, Types.BIGINT);
            ps.setString(11, entity.errorMessage);
            return map(ps.executeQuery()).get(0);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Optional<SparkJob> update(Long id, SparkJob entity) {
        String sql = """
            UPDATE spark_jobs SET
              job_name=?, application_id=?, status=?, master_url=?, jar_path=?, main_class=?,
              spark_config=?, started_at=?, finished_at=?, duration_ms=?, error_message=?,
              updated_at=NOW()
            WHERE id=? AND deleted_at IS NULL
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setString(1, entity.jobName);
            ps.setString(2, entity.applicationId);
            ps.setString(3, entity.status);
            ps.setString(4, entity.masterUrl);
            ps.setString(5, entity.jarPath);
            ps.setString(6, entity.mainClass);
            ps.setString(7, entity.sparkConfig);
            ps.setObject(8, entity.startedAt);
            ps.setObject(9, entity.finishedAt);
            if (entity.durationMs != null) ps.setLong(10, entity.durationMs); else ps.setNull(10, Types.BIGINT);
            ps.setString(11, entity.errorMessage);
            ps.setLong(12, id);
            var list = map(ps.executeQuery());
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public boolean delete(Long id) {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(
                 "UPDATE " + TABLE + " SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL")) {
            ps.setLong(1, id);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public List<SparkJob> search(String q, int page, int size) {
        String like = "%" + q + "%";
        String sql = "SELECT * FROM " + TABLE
            + " WHERE (job_name ILIKE ?) AND deleted_at IS NULL"
            + " LIMIT ? OFFSET ?";
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setString(1, like);
            ps.setInt(2, size);
            ps.setInt(3, page * size);
            return map(ps.executeQuery());
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private List<SparkJob> map(ResultSet rs) throws SQLException {
        List<SparkJob> list = new ArrayList<>();
        while (rs.next()) {
            var e = new SparkJob();
            e.id            = rs.getLong("id");
            e.jobName       = rs.getString("job_name");
            e.applicationId = rs.getString("application_id");
            e.status        = rs.getString("status");
            e.masterUrl     = rs.getString("master_url");
            e.jarPath       = rs.getString("jar_path");
            e.mainClass     = rs.getString("main_class");
            e.sparkConfig   = rs.getString("spark_config");
            e.startedAt     = rs.getObject("started_at",   LocalDateTime.class);
            e.finishedAt    = rs.getObject("finished_at",  LocalDateTime.class);
            e.durationMs    = rs.getObject("duration_ms",  Long.class);
            e.errorMessage  = rs.getString("error_message");
            e.createdAt     = rs.getObject("created_at",   LocalDateTime.class);
            e.updatedAt     = rs.getObject("updated_at",   LocalDateTime.class);
            e.deletedAt     = rs.getObject("deleted_at",   LocalDateTime.class);
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
