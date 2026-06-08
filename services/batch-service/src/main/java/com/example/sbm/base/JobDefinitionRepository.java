package com.example.sbm.base;

import com.example.sbm.model.JobDefinition;
import com.example.sbm.model.JobType;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.util.*;

/**
 * Repository MongoDB per {@link JobDefinition}.
 *
 * Collection: {@code job_definitions}
 * Indice chiave: {@code {jobType:1, enabled:1}} per il lookup dello scheduler.
 */
@ApplicationScoped
public class JobDefinitionRepository {

    @Inject MongoClient mongoClient;

    @ConfigProperty(name = "quarkus.mongodb.database")
    String dbName;

    static final String COL = "job_definitions";

    MongoCollection<Document> col() {
        return mongoClient.getDatabase(dbName).getCollection(COL);
    }

    // -- CRUD -----------------------------------------------------------------

    public List<JobDefinition> findAll(int page, int size) {
        return col().find()
            .sort(Sorts.ascending("name"))
            .skip(page * size).limit(size)
            .map(this::fromDoc).into(new ArrayList<>());
    }

    public long count() { return col().countDocuments(); }

    public Optional<JobDefinition> findById(String id) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        return Optional.ofNullable(col().find(Filters.eq("_id", new ObjectId(id))).first())
            .map(this::fromDoc);
    }

    public Optional<JobDefinition> findByName(String name) {
        return Optional.ofNullable(col().find(Filters.eq("name", name)).first())
            .map(this::fromDoc);
    }

    public JobDefinition create(JobDefinition jd) {
        Instant now = Instant.now();
        jd.createdAt = now; jd.updatedAt = now;
        if (jd.enabled        == null) jd.enabled        = true;
        if (jd.maxConcurrentRuns == null) jd.maxConcurrentRuns = 1;
        if (jd.maxRetries     == null) jd.maxRetries     = 0;
        if (jd.retryDelayMinutes == null) jd.retryDelayMinutes = 5;
        if (jd.sparkVersion   == null) jd.sparkVersion   = "3.5";
        if (jd.executorMemory == null) jd.executorMemory = "4g";
        if (jd.executorCores  == null) jd.executorCores  = 2;
        Document doc = toDoc(jd);
        col().insertOne(doc);
        jd.id = doc.getObjectId("_id");
        return jd;
    }

    public Optional<JobDefinition> update(String id, JobDefinition jd) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        jd.updatedAt = Instant.now();
        Document result = col().findOneAndUpdate(
            Filters.eq("_id", new ObjectId(id)),
            new Document("$set", toDoc(jd)),
            new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER)
        );
        return Optional.ofNullable(result).map(this::fromDoc);
    }

    public boolean delete(String id) {
        if (!ObjectId.isValid(id)) return false;
        return col().deleteOne(Filters.eq("_id", new ObjectId(id))).getDeletedCount() > 0;
    }

    // -- Query specifiche scheduler --------------------------------------------

    /** Recupera tutti i job SCHEDULED abilitati. */
    public List<JobDefinition> findEnabledScheduled() {
        return col().find(Filters.and(
            Filters.eq("jobType", JobType.SCHEDULED.name()),
            Filters.eq("enabled", true)
        )).map(this::fromDoc).into(new ArrayList<>());
    }

    /** Recupera tutti i job FILE_DRIVEN abilitati per un bucket specifico. */
    public List<JobDefinition> findEnabledFileDrivenByBucket(String bucketUri) {
        return col().find(Filters.and(
            Filters.eq("jobType", JobType.FILE_DRIVEN.name()),
            Filters.eq("enabled", true),
            Filters.eq("inputBucketUri", bucketUri)
        )).map(this::fromDoc).into(new ArrayList<>());
    }

    /** Ricerca testuale su name, description, category, tags. */
    public List<JobDefinition> search(String q, int page, int size) {
        return col().find(Filters.or(
            Filters.regex("name",        q, "i"),
            Filters.regex("description", q, "i"),
            Filters.regex("category",    q, "i"),
            Filters.regex("owner",       q, "i")
        )).skip(page * size).limit(size).map(this::fromDoc).into(new ArrayList<>());
    }

    // -- Mapping ---------------------------------------------------------------

    JobDefinition fromDoc(Document d) {
        var jd = new JobDefinition();
        jd.id                = d.getObjectId("_id");
        jd.name              = d.getString("name");
        jd.description       = d.getString("description");
        String jt            = d.getString("jobType");
        jd.jobType           = jt != null ? JobType.valueOf(jt) : null;
        jd.category          = d.getString("category");
        jd.cronExpression    = d.getString("cronExpression");
        jd.inputBucketUri    = d.getString("inputBucketUri");
        jd.filePattern       = d.getString("filePattern");
        String om            = d.getString("outputMode");
        jd.outputMode        = om != null ? com.example.sbm.model.OutputMode.valueOf(om) : null;
        jd.outputBucketUri   = d.getString("outputBucketUri");
        jd.outputDbType      = d.getString("outputDbType");
        jd.outputDbTarget    = d.getString("outputDbTarget");
        jd.outputWriteMode   = d.getString("outputWriteMode");
        jd.gcpProjectId      = d.getString("gcpProjectId");
        jd.gcpRegion         = d.getString("gcpRegion");
        jd.dataprocBatchTemplate = d.getString("dataprocBatchTemplate");
        jd.sparkMainScript   = d.getString("sparkMainScript");
        jd.sparkArguments    = d.getList("sparkArguments", String.class);
        jd.sparkVersion      = d.getString("sparkVersion");
        jd.executorMemory    = d.getString("executorMemory");
        jd.executorCores     = d.getInteger("executorCores");
        jd.enabled           = d.getBoolean("enabled", true);
        jd.maxConcurrentRuns = d.getInteger("maxConcurrentRuns", 1);
        jd.timeoutMinutes    = d.getInteger("timeoutMinutes");
        jd.maxRetries        = d.getInteger("maxRetries", 0);
        jd.retryDelayMinutes = d.getInteger("retryDelayMinutes", 5);
        jd.alertEmails       = d.getList("alertEmails", String.class);
        jd.webhookUrl        = d.getString("webhookUrl");
        jd.tags              = d.getList("tags", String.class);
        jd.owner             = d.getString("owner");
        jd.createdAt         = parseInstant(d.getString("createdAt"));
        jd.updatedAt         = parseInstant(d.getString("updatedAt"));
        return jd;
    }

    Document toDoc(JobDefinition jd) {
        Document d = new Document();
        if (jd.name != null)              d.put("name",              jd.name);
        if (jd.description != null)       d.put("description",       jd.description);
        if (jd.jobType != null)           d.put("jobType",           jd.jobType.name());
        if (jd.category != null)          d.put("category",          jd.category);
        if (jd.cronExpression != null)    d.put("cronExpression",    jd.cronExpression);
        if (jd.inputBucketUri != null)    d.put("inputBucketUri",    jd.inputBucketUri);
        if (jd.filePattern != null)       d.put("filePattern",       jd.filePattern);
        if (jd.outputMode != null)        d.put("outputMode",        jd.outputMode.name());
        if (jd.outputBucketUri != null)   d.put("outputBucketUri",   jd.outputBucketUri);
        if (jd.outputDbType != null)      d.put("outputDbType",      jd.outputDbType);
        if (jd.outputDbTarget != null)    d.put("outputDbTarget",    jd.outputDbTarget);
        if (jd.outputWriteMode != null)   d.put("outputWriteMode",   jd.outputWriteMode);
        if (jd.gcpProjectId != null)      d.put("gcpProjectId",      jd.gcpProjectId);
        if (jd.gcpRegion != null)         d.put("gcpRegion",         jd.gcpRegion);
        if (jd.dataprocBatchTemplate != null) d.put("dataprocBatchTemplate", jd.dataprocBatchTemplate);
        if (jd.sparkMainScript != null)   d.put("sparkMainScript",   jd.sparkMainScript);
        if (jd.sparkArguments != null)    d.put("sparkArguments",    jd.sparkArguments);
        if (jd.sparkVersion != null)      d.put("sparkVersion",      jd.sparkVersion);
        if (jd.executorMemory != null)    d.put("executorMemory",    jd.executorMemory);
        if (jd.executorCores != null)     d.put("executorCores",     jd.executorCores);
        d.put("enabled",          jd.enabled != null ? jd.enabled : true);
        d.put("maxConcurrentRuns",jd.maxConcurrentRuns != null ? jd.maxConcurrentRuns : 1);
        if (jd.timeoutMinutes != null)    d.put("timeoutMinutes",    jd.timeoutMinutes);
        d.put("maxRetries",       jd.maxRetries != null ? jd.maxRetries : 0);
        d.put("retryDelayMinutes",jd.retryDelayMinutes != null ? jd.retryDelayMinutes : 5);
        if (jd.alertEmails != null)       d.put("alertEmails",       jd.alertEmails);
        if (jd.webhookUrl != null)        d.put("webhookUrl",        jd.webhookUrl);
        if (jd.tags != null)              d.put("tags",              jd.tags);
        if (jd.owner != null)             d.put("owner",             jd.owner);
        if (jd.createdAt != null)         d.put("createdAt",         jd.createdAt.toString());
        if (jd.updatedAt != null)         d.put("updatedAt",         jd.updatedAt.toString());
        return d;
    }

    static Instant parseInstant(String s) {
        try { return s != null ? Instant.parse(s) : null; } catch (Exception e) { return null; }
    }
}
