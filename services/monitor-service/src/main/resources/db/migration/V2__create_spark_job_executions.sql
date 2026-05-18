-- V2__create_spark_job_executions.sql
CREATE TABLE IF NOT EXISTS spark_job_executions (
    id               BIGSERIAL PRIMARY KEY,
    spark_job_id     BIGINT        NOT NULL REFERENCES spark_jobs(id) ON DELETE CASCADE,
    execution_number INTEGER       NOT NULL,
    status           VARCHAR(50)   NOT NULL,
    started_at       TIMESTAMP,
    finished_at      TIMESTAMP,
    duration_ms      BIGINT,
    records_read     BIGINT,
    records_written  BIGINT,
    error_message    VARCHAR(5000),
    spark_ui_url     VARCHAR(500),
    logs_path        VARCHAR(1000),
    created_at       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spark_job_executions_job_id ON spark_job_executions(spark_job_id);
CREATE INDEX idx_spark_job_executions_status ON spark_job_executions(status);

CREATE TRIGGER trg_spark_job_executions_updated_at
    BEFORE UPDATE ON spark_job_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
