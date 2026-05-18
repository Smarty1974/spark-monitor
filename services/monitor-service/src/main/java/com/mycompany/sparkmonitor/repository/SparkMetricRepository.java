package com.mycompany.sparkmonitor.repository;

import com.mycompany.sparkmonitor.entity.SparkMetric;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import javax.sql.DataSource;
import java.sql.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

@ApplicationScoped
public class SparkMetricRepository {

    @Inject DataSource dataSource;

    private static final String TABLE = "spark_metrics";
    private static final Set<String> SORTABLE = Set.of(
        "id", "metric_name", "metric_value", "recorded_at", "stage", "created_at"
    );

    public List<SparkMetric> findAll(int page, int size, String sort, String order) {
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

    public Optional<SparkMetric> findById(Long id) {
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement("SELECT * FROM " + TABLE + " WHERE id=?")) {
            ps.setLong(1, id);
            var list = map(ps.executeQuery());
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public List<SparkMetric> findByExecutionId(Long executionId, int page, int size) {
        String sql = "SELECT * FROM " + TABLE
            + " WHERE execution_id=? ORDER BY recorded_at DESC LIMIT ? OFFSET ?";
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, executionId);
            ps.setInt(2, size);
            ps.setInt(3, page * size);
            return map(ps.executeQuery());
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public SparkMetric create(SparkMetric entity) {
        String sql = """
            INSERT INTO spark_metrics
              (execution_id, metric_name, metric_value, metric_unit, recorded_at, stage)
            VALUES (?,?,?,?,?,?)
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, entity.executionId);
            ps.setString(2, entity.metricName);
            ps.setBigDecimal(3, entity.metricValue);
            ps.setString(4, entity.metricUnit);
            ps.setObject(5, entity.recordedAt);
            ps.setString(6, entity.stage);
            return map(ps.executeQuery()).get(0);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public Optional<SparkMetric> update(Long id, SparkMetric entity) {
        String sql = """
            UPDATE spark_metrics SET
              execution_id=?, metric_name=?, metric_value=?, metric_unit=?,
              recorded_at=?, stage=?, updated_at=NOW()
            WHERE id=?
            RETURNING *
            """;
        try (var conn = dataSource.getConnection();
             var ps = conn.prepareStatement(sql)) {
            ps.setLong(1, entity.executionId);
            ps.setString(2, entity.metricName);
            ps.setBigDecimal(3, entity.metricValue);
            ps.setString(4, entity.metricUnit);
            ps.setObject(5, entity.recordedAt);
            ps.setString(6, entity.stage);
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

    private List<SparkMetric> map(ResultSet rs) throws SQLException {
        List<SparkMetric> list = new ArrayList<>();
        while (rs.next()) {
            var e = new SparkMetric();
            e.id          = rs.getLong("id");
            e.executionId = rs.getLong("execution_id");
            e.metricName  = rs.getString("metric_name");
            e.metricValue = rs.getBigDecimal("metric_value");
            e.metricUnit  = rs.getString("metric_unit");
            e.recordedAt  = rs.getObject("recorded_at", LocalDateTime.class);
            e.stage       = rs.getString("stage");
            e.createdAt   = rs.getObject("created_at",  LocalDateTime.class);
            e.updatedAt   = rs.getObject("updated_at",  LocalDateTime.class);
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
