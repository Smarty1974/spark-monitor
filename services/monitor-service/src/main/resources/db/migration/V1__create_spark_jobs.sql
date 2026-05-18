-- V1__create_spark_jobs.sql
CREATE TABLE IF NOT EXISTS spark_jobs (
    id              BIGSERIAL PRIMARY KEY,
    job_name        VARCHAR(255)  NOT NULL,
    application_id  VARCHAR(100)  UNIQUE,
    status          VARCHAR(50)   NOT NULL DEFAULT 'PENDING',
    master_url      VARCHAR(500)  NOT NULL,
    jar_path        VARCHAR(1000) NOT NULL,
    main_class      VARCHAR(500)  NOT NULL,
    spark_config    VARCHAR(5000),
    started_at      TIMESTAMP,
    finished_at     TIMESTAMP,
    duration_ms     BIGINT,
    error_message   VARCHAR(5000),
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

CREATE INDEX idx_spark_jobs_status   ON spark_jobs(status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_spark_jobs_job_name ON spark_jobs(job_name) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_spark_jobs_updated_at
    BEFORE UPDATE ON spark_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
