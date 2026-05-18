-- V3__create_spark_metrics.sql
CREATE TABLE IF NOT EXISTS spark_metrics (
    id            BIGSERIAL PRIMARY KEY,
    execution_id  BIGINT          NOT NULL REFERENCES spark_job_executions(id) ON DELETE CASCADE,
    metric_name   VARCHAR(255)    NOT NULL,
    metric_value  NUMERIC(19, 4)  NOT NULL,
    metric_unit   VARCHAR(50),
    recorded_at   TIMESTAMP       NOT NULL,
    stage         VARCHAR(100),
    created_at    TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spark_metrics_execution_id ON spark_metrics(execution_id);
CREATE INDEX idx_spark_metrics_recorded_at  ON spark_metrics(recorded_at);
CREATE INDEX idx_spark_metrics_metric_name  ON spark_metrics(metric_name);

CREATE TRIGGER trg_spark_metrics_updated_at
    BEFORE UPDATE ON spark_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
