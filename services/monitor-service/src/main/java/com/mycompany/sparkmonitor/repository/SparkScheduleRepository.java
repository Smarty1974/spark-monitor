package com.mycompany.sparkmonitor.repository;

import com.mycompany.sparkmonitor.entity.SparkSchedule;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import javax.sql.DataSource;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;

@ApplicationScoped
public class SparkScheduleRepository {

    @Inject DataSource dataSource;

    private static final String TABLE = "spark_schedules";
    private static final Set<String> SORTABLE = Set.of(
        "id", "schedule_name", "cron_expr", "enabled", "last_run_at", "next_run_at", "created_at"
    );

    public List<SparkSchedule> findAll(int page, int size, String sort, String order) {
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

    public Optional<SparkSchedule> findById(Long id) {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(
                 "SELECT * FROM " + TABLE + " WHERE id=? AND deleted_at IS NULL")) {
            ps.setLong(1, id);
            var list = map(ps.executeQuery());
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public SparkSchedule create(SparkSchedule entity) {
        String sql = """
            INSERT INTO spark_schedules
              (spark_job_id, schedule_name, cron_expr, enabled, description, last_run_at, next_run_at)
            VALUES (?,?,?,?,?,?,?)
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, entity.sparkJobId);
            ps.setString(2, entity.scheduleName);
            ps.setString(3, entity.cronExpr);
            ps.setBoolean(4, entity.enabled != null ? entity.enabled : true);
            ps.setString(5, entity.description);
            ps.setObject(6, entity.lastRunAt);
            ps.setObject(7, entity.nextRunAt);
            return map(ps.executeQuery()).get(0);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Optional<SparkSchedule> update(Long id, SparkSchedule entity) {
        String sql = """
            UPDATE spark_schedules SET
              spark_job_id=?, schedule_name=?, cron_expr=?, enabled=?, description=?,
              last_run_at=?, next_run_at=?, updated_at=NOW()
            WHERE id=? AND deleted_at IS NULL
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, entity.sparkJobId);
            ps.setString(2, entity.scheduleName);
            ps.setString(3, entity.cronExpr);
            ps.setBoolean(4, entity.enabled != null ? entity.enabled : true);
            ps.setString(5, entity.description);
            ps.setObject(6, entity.lastRunAt);
            ps.setObject(7, entity.nextRunAt);
            ps.setLong(8, id);
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

    public List<SparkSchedule> search(String q, int page, int size) {
        String like = "%" + q + "%";
        String sql = "SELECT * FROM " + TABLE
            + " WHERE (schedule_name ILIKE ?) AND deleted_at IS NULL LIMIT ? OFFSET ?";
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setString(1, like);
            ps.setInt(2, size);
            ps.setInt(3, page * size);
            return map(ps.executeQuery());
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    private List<SparkSchedule> map(ResultSet rs) throws SQLException {
        List<SparkSchedule> list = new ArrayList<>();
        while (rs.next()) {
            var e = new SparkSchedule();
            e.id           = rs.getLong("id");
            e.sparkJobId   = rs.getLong("spark_job_id");
            e.scheduleName = rs.getString("schedule_name");
            e.cronExpr     = rs.getString("cron_expr");
            e.enabled      = rs.getBoolean("enabled");
            e.description  = rs.getString("description");
            e.lastRunAt    = rs.getObject("last_run_at",  LocalDateTime.class);
            e.nextRunAt    = rs.getObject("next_run_at",  LocalDateTime.class);
            e.createdAt    = rs.getObject("created_at",   LocalDateTime.class);
            e.updatedAt    = rs.getObject("updated_at",   LocalDateTime.class);
            e.deletedAt    = rs.getObject("deleted_at",   LocalDateTime.class);
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
