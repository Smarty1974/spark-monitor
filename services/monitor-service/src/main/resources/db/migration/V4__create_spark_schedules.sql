-- V4__create_spark_schedules.sql
CREATE TABLE IF NOT EXISTS spark_schedules (
    id            BIGSERIAL PRIMARY KEY,
    spark_job_id  BIGINT        NOT NULL REFERENCES spark_jobs(id) ON DELETE CASCADE,
    schedule_name VARCHAR(255)  NOT NULL,
    cron_expr     VARCHAR(100)  NOT NULL,
    enabled       BOOLEAN       NOT NULL DEFAULT TRUE,
    description   VARCHAR(1000),
    last_run_at   TIMESTAMP,
    next_run_at   TIMESTAMP,
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

CREATE INDEX idx_spark_schedules_job_id  ON spark_schedules(spark_job_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_spark_schedules_enabled ON spark_schedules(enabled)      WHERE deleted_at IS NULL;

CREATE TRIGGER trg_spark_schedules_updated_at
    BEFORE UPDATE ON spark_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
