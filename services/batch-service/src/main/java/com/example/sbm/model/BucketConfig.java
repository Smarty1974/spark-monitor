package com.example.sbm.model;

import org.bson.types.ObjectId;
import java.time.Instant;

/**
 * Documento MongoDB: collection {@code bucket_configs}.
 * Associa un bucket GCS/S3 a un template di job Spark Dataproc.
 */
public class BucketConfig {

    public ObjectId id;
    public String   name;
    public String   bucketUri;
    /** GCS | S3 */
    public String   storageType;
    /** Template resource name Dataproc (puo contenere {fileName}) */
    public String   dataprocBatchTemplate;
    public String   gcpProjectId;
    public String   gcpRegion;
    public String   filePattern;
    public Boolean  triggerEnabled;
    public Integer  maxConcurrentJobs;
    public String   description;
    public Instant  createdAt;
    public Instant  updatedAt;

    public BucketConfig() {}
}
