-- V5__create_spark_alerts.sql
CREATE TABLE IF NOT EXISTS spark_alerts (
    id           BIGSERIAL PRIMARY KEY,
    spark_job_id BIGINT        REFERENCES spark_jobs(id) ON DELETE SET NULL,
    alert_type   VARCHAR(100)  NOT NULL,
    severity     VARCHAR(50)   NOT NULL,
    message      VARCHAR(2000) NOT NULL,
    resolved     BOOLEAN       NOT NULL DEFAULT FALSE,
    resolved_at  TIMESTAMP,
    created_at   TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spark_alerts_job_id   ON spark_alerts(spark_job_id);
CREATE INDEX idx_spark_alerts_severity ON spark_alerts(severity);
CREATE INDEX idx_spark_alerts_resolved ON spark_alerts(resolved);

CREATE TRIGGER trg_spark_alerts_updated_at
    BEFORE UPDATE ON spark_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
