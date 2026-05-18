package com.mycompany.sparkmonitor.repository;

import com.mycompany.sparkmonitor.entity.SparkAlert;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import javax.sql.DataSource;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;

@ApplicationScoped
public class SparkAlertRepository {

    @Inject DataSource dataSource;

    private static final String TABLE = "spark_alerts";
    private static final Set<String> SORTABLE = Set.of(
        "id", "alert_type", "severity", "resolved", "created_at", "resolved_at"
    );

    public List<SparkAlert> findAll(int page, int size, String sort, String order) {
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

    public Optional<SparkAlert> findById(Long id) {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement("SELECT * FROM " + TABLE + " WHERE id=?")) {
            ps.setLong(1, id);
            var list = map(ps.executeQuery());
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public SparkAlert create(SparkAlert entity) {
        String sql = """
            INSERT INTO spark_alerts
              (spark_job_id, alert_type, severity, message, resolved, resolved_at)
            VALUES (?,?,?,?,?,?)
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            if (entity.sparkJobId != null) ps.setLong(1, entity.sparkJobId); else ps.setNull(1, Types.BIGINT);
            ps.setString(2, entity.alertType);
            ps.setString(3, entity.severity);
            ps.setString(4, entity.message);
            ps.setBoolean(5, entity.resolved != null ? entity.resolved : false);
            ps.setObject(6, entity.resolvedAt);
            return map(ps.executeQuery()).get(0);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Optional<SparkAlert> update(Long id, SparkAlert entity) {
        String sql = """
            UPDATE spark_alerts SET
              spark_job_id=?, alert_type=?, severity=?, message=?,
              resolved=?, resolved_at=?, updated_at=NOW()
            WHERE id=?
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            if (entity.sparkJobId != null) ps.setLong(1, entity.sparkJobId); else ps.setNull(1, Types.BIGINT);
            ps.setString(2, entity.alertType);
            ps.setString(3, entity.severity);
            ps.setString(4, entity.message);
            ps.setBoolean(5, entity.resolved != null ? entity.resolved : false);
            ps.setObject(6, entity.resolvedAt);
            ps.setLong(7, id);
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

    private List<SparkAlert> map(ResultSet rs) throws SQLException {
        List<SparkAlert> list = new ArrayList<>();
        while (rs.next()) {
            var e = new SparkAlert();
            e.id         = rs.getLong("id");
            e.sparkJobId = rs.getObject("spark_job_id", Long.class);
            e.alertType  = rs.getString("alert_type");
            e.severity   = rs.getString("severity");
            e.message    = rs.getString("message");
            e.resolved   = rs.getBoolean("resolved");
            e.resolvedAt = rs.getObject("resolved_at", LocalDateTime.class);
            e.createdAt  = rs.getObject("created_at",  LocalDateTime.class);
            e.updatedAt  = rs.getObject("updated_at",  LocalDateTime.class);
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
