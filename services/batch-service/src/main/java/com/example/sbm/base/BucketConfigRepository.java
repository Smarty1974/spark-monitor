package com.example.sbm.base;

import com.example.sbm.model.BucketConfig;
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

@ApplicationScoped
public class BucketConfigRepository {

    @Inject MongoClient mongoClient;

    @ConfigProperty(name = "quarkus.mongodb.database")
    String dbName;

    static final String COL = "bucket_configs";

    MongoCollection<Document> col() {
        return mongoClient.getDatabase(dbName).getCollection(COL);
    }

    public List<BucketConfig> findAll(int page, int size, String sort, String order) {
        var sortBson = "desc".equalsIgnoreCase(order)
            ? Sorts.descending(sort) : Sorts.ascending(sort);
        return col().find().sort(sortBson).skip(page * size).limit(size)
            .map(this::fromDoc).into(new ArrayList<>());
    }

    public long count() { return col().countDocuments(); }

    public Optional<BucketConfig> findById(String id) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        return Optional.ofNullable(col().find(Filters.eq("_id", new ObjectId(id))).first())
            .map(this::fromDoc);
    }

    public BucketConfig create(BucketConfig bc) {
        Instant now = Instant.now();
        bc.createdAt = now; bc.updatedAt = now;
        if (bc.triggerEnabled == null)    bc.triggerEnabled    = true;
        if (bc.maxConcurrentJobs == null) bc.maxConcurrentJobs = 5;
        if (bc.storageType == null)       bc.storageType       = "GCS";
        Document doc = toDoc(bc);
        col().insertOne(doc);
        bc.id = doc.getObjectId("_id");
        return bc;
    }

    public Optional<BucketConfig> update(String id, BucketConfig bc) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        bc.updatedAt = Instant.now();
        Document result = col().findOneAndUpdate(
            Filters.eq("_id", new ObjectId(id)),
            new Document("$set", toDoc(bc)),
            new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER));
        return Optional.ofNullable(result).map(this::fromDoc);
    }

    public boolean delete(String id) {
        if (!ObjectId.isValid(id)) return false;
        return col().deleteOne(Filters.eq("_id", new ObjectId(id))).getDeletedCount() > 0;
    }

    public List<BucketConfig> search(String q, int page, int size) {
        return col().find(Filters.or(
            Filters.regex("name",      q, "i"),
            Filters.regex("bucketUri", q, "i")
        )).skip(page * size).limit(size).map(this::fromDoc).into(new ArrayList<>());
    }

    public List<BucketConfig> findActive() {
        return col().find(Filters.eq("triggerEnabled", true))
            .map(this::fromDoc).into(new ArrayList<>());
    }

    BucketConfig fromDoc(Document d) {
        var bc = new BucketConfig();
        bc.id                   = d.getObjectId("_id");
        bc.name                 = d.getString("name");
        bc.bucketUri            = d.getString("bucketUri");
        bc.storageType          = d.getString("storageType");
        bc.dataprocBatchTemplate= d.getString("dataprocBatchTemplate");
        bc.gcpProjectId         = d.getString("gcpProjectId");
        bc.gcpRegion            = d.getString("gcpRegion");
        bc.filePattern          = d.getString("filePattern");
        bc.triggerEnabled       = d.getBoolean("triggerEnabled", true);
        bc.maxConcurrentJobs    = d.getInteger("maxConcurrentJobs", 5);
        bc.description          = d.getString("description");
        bc.createdAt            = BatchProcessRepository.parseInstant(d.getString("createdAt"));
        bc.updatedAt            = BatchProcessRepository.parseInstant(d.getString("updatedAt"));
        return bc;
    }

    Document toDoc(BucketConfig bc) {
        return new Document()
            .append("name",                  bc.name)
            .append("bucketUri",             bc.bucketUri)
            .append("storageType",           bc.storageType)
            .append("dataprocBatchTemplate", bc.dataprocBatchTemplate)
            .append("gcpProjectId",          bc.gcpProjectId)
            .append("gcpRegion",             bc.gcpRegion)
            .append("filePattern",           bc.filePattern)
            .append("triggerEnabled",        bc.triggerEnabled)
            .append("maxConcurrentJobs",     bc.maxConcurrentJobs)
            .append("description",           bc.description)
            .append("createdAt",             bc.createdAt != null ? bc.createdAt.toString() : null)
            .append("updatedAt",             bc.updatedAt != null ? bc.updatedAt.toString() : null);
    }
}
