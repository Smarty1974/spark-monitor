package com.example.sbm.base;

import com.example.sbm.model.BatchProcess;
import com.example.sbm.model.BatchState;
import com.example.sbm.model.HistoryEntry;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.bson.types.ObjectId;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.*;

/**
 * Repository MongoDB per {@link BatchProcess}.
 *
 * <h3>Ottimizzazioni applicate:</h3>
 * <ul>
 *   <li>{@link #findSubmittedForPolling(int)} usa <b>proiezione minima</b>:
 *       carica solo {@code _id, batchResourceName, fileName, updatedAt}.
 *       L'array {@code history} (potenzialmente molto grande) NON viene caricato.</li>
 *   <li>Le transizioni di stato usano {@code updateOne} atomici con
 *       filtro su {@code {_id, state}} per evitare race condition tra piu
 *       istanze dello scheduler.</li>
 *   <li>Indice composito {@code {state:1, updatedAt:1}} creato all'avvio
 *       da {@link MongoIndexInitializer}.</li>
 * </ul>
 */
@ApplicationScoped
public class BatchProcessRepository {

    private static final Logger LOG = Logger.getLogger(BatchProcessRepository.class);

    @Inject MongoClient mongoClient;

    @ConfigProperty(name = "quarkus.mongodb.database")
    String dbName;

    static final String COL = "batch_processes";

    MongoCollection<Document> col() {
        return mongoClient.getDatabase(dbName).getCollection(COL);
    }

    // -- CRUD standard ---------------------------------------------------------

    public List<BatchProcess> findAll(int page, int size, String sort, String order) {
        Bson sortBson = "desc".equalsIgnoreCase(order)
            ? Sorts.descending(safeSort(sort))
            : Sorts.ascending(safeSort(sort));
        return col().find()
            .sort(sortBson).skip(page * size).limit(size)
            .map(this::fromDoc).into(new ArrayList<>());
    }

    public long count() { return col().countDocuments(); }

    public Optional<BatchProcess> findById(String id) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        return Optional.ofNullable(
            col().find(Filters.eq("_id", new ObjectId(id))).first()
        ).map(this::fromDoc);
    }

    public BatchProcess create(BatchProcess bp) {
        Instant now = Instant.now();
        bp.createdAt = now;
        bp.updatedAt = now;
        if (bp.state == null) bp.state = BatchState.FILE_RECEIVED;
        if (bp.history == null) bp.history = new ArrayList<>();
        bp.history.add(new HistoryEntry(null, bp.state, "Processo creato"));
        Document doc = toDoc(bp);
        col().insertOne(doc);
        bp.id = doc.getObjectId("_id");
        return bp;
    }

    public Optional<BatchProcess> update(String id, BatchProcess bp) {
        if (!ObjectId.isValid(id)) return Optional.empty();
        bp.updatedAt = Instant.now();
        Document upd = new Document("$set", new Document()
            .append("fileName",          bp.fileName)
            .append("bucketUri",         bp.bucketUri)
            .append("batchResourceName", bp.batchResourceName)
            .append("state",             bp.state != null ? bp.state.name() : null)
            .append("errorMessage",      bp.errorMessage)
            .append("sparkJobId",        bp.sparkJobId)
            .append("metadataJson",      bp.metadataJson)
            .append("updatedAt",         bp.updatedAt.toString()));
        Document result = col().findOneAndUpdate(
            Filters.eq("_id", new ObjectId(id)), upd,
            new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER));
        return Optional.ofNullable(result).map(this::fromDoc);
    }

    public boolean delete(String id) {
        if (!ObjectId.isValid(id)) return false;
        return col().deleteOne(Filters.eq("_id", new ObjectId(id))).getDeletedCount() > 0;
    }

    public List<BatchProcess> search(String q, int page, int size) {
        Bson filter = Filters.or(
            Filters.regex("fileName",  q, "i"),
            Filters.regex("bucketUri", q, "i"),
            Filters.regex("sparkJobId",q, "i")
        );
        return col().find(filter).skip(page * size).limit(size)
            .map(this::fromDoc).into(new ArrayList<>());
    }

    public long countByState(BatchState state) {
        return col().countDocuments(Filters.eq("state", state.name()));
    }

    // -- Scheduler: proiezione minima ------------------------------------------

    /**
     * Carica SOLO i campi necessari allo scheduler.
     * La proiezione esclude {@code history} (array grande) e tutti i campi non usati.
     *
     * <p>Query: {@code { state: "SPARK_SUBMITTED" }}
     * <p>Proiezione: {@code { batchResourceName:1, fileName:1, updatedAt:1 }}
     * <p>Hint indice: {@code { state:1, updatedAt:1 }}
     */
    public List<PollingProjection> findSubmittedForPolling(int limit) {
        Bson filter     = Filters.eq("state", BatchState.SPARK_SUBMITTED.name());
        Bson projection = Projections.fields(
            Projections.include("batchResourceName", "fileName", "updatedAt"),
            Projections.excludeId()
        );
        List<PollingProjection> result = new ArrayList<>();
        col().find(filter)
            .projection(projection)
            .hint(new Document("state", 1).append("updatedAt", 1))
            .limit(limit)
            .forEach(doc -> {
                ObjectId oid = doc.getObjectId("_id");
                result.add(new PollingProjection(
                    oid != null ? oid.toHexString() : null,
                    doc.getString("batchResourceName"),
                    doc.getString("fileName"),
                    parseInstant(doc.getString("updatedAt"))
                ));
            });
        return result;
    }

    /**
     * Proiezione minima per il polling dello scheduler.
     * Solo i campi strettamente necessari vengono caricati da MongoDB.
     */
    public record PollingProjection(
        String  id,
        String  batchResourceName,
        String  fileName,
        Instant updatedAt
    ) {}

    // -- Transizioni atomiche --------------------------------------------------

    /**
     * SPARK_SUBMITTED -> COMPLETED (atomico).
     *
     * <p>Il filtro su {@code {_id, state:"SPARK_SUBMITTED"}} garantisce idempotenza:
     * se il documento e gia COMPLETED l'update restituisce 0 modified.
     */
    public boolean transitionToCompleted(String id, HistoryEntry entry) {
        return atomicTransition(id, BatchState.SPARK_SUBMITTED,
            Updates.combine(
                Updates.set("state",     BatchState.COMPLETED.name()),
                Updates.set("updatedAt", Instant.now().toString()),
                Updates.unset("errorMessage"),
                Updates.push("history",  entry.toDocument())
            ));
    }

    /**
     * SPARK_SUBMITTED -> FAILED (atomico).
     * Imposta {@code errorMessage} con dettagli da GCP o motivo timeout.
     */
    public boolean transitionToFailed(String id, String errorMessage, HistoryEntry entry) {
        return atomicTransition(id, BatchState.SPARK_SUBMITTED,
            Updates.combine(
                Updates.set("state",        BatchState.FAILED.name()),
                Updates.set("errorMessage", errorMessage),
                Updates.set("updatedAt",    Instant.now().toString()),
                Updates.push("history",     entry.toDocument())
            ));
    }

    /**
     * FILE_RECEIVED -> SPARK_SUBMITTED (atomico).
     */
    public boolean transitionToSubmitted(String id, String batchResourceName,
                                          String sparkJobId, HistoryEntry entry) {
        return atomicTransition(id, BatchState.FILE_RECEIVED,
            Updates.combine(
                Updates.set("state",             BatchState.SPARK_SUBMITTED.name()),
                Updates.set("batchResourceName", batchResourceName),
                Updates.set("sparkJobId",        sparkJobId),
                Updates.set("updatedAt",         Instant.now().toString()),
                Updates.push("history",          entry.toDocument())
            ));
    }

    /** Update atomico con filtro su {@code _id + stateAtteso}. */
    private boolean atomicTransition(String id, BatchState stateAtteso, Bson update) {
        if (!ObjectId.isValid(id)) return false;
        Bson filter = Filters.and(
            Filters.eq("_id",   new ObjectId(id)),
            Filters.eq("state", stateAtteso.name())
        );
        long modified = col().updateOne(filter, update).getModifiedCount();
        if (modified == 0)
            LOG.debugf("Transizione non applicata id=%s stateAtteso=%s (gia aggiornato?)", id, stateAtteso);
        return modified > 0;
    }

    // -- Mapping BSON ? POJO ---------------------------------------------------

    BatchProcess fromDoc(Document d) {
        var bp = new BatchProcess();
        bp.id                = d.getObjectId("_id");
        bp.fileName          = d.getString("fileName");
        bp.bucketUri         = d.getString("bucketUri");
        bp.batchResourceName = d.getString("batchResourceName");
        String st = d.getString("state");
        bp.state             = st != null ? BatchState.valueOf(st) : null;
        bp.errorMessage      = d.getString("errorMessage");
        bp.sparkJobId        = d.getString("sparkJobId");
        bp.bucketConfigId    = d.getString("bucketConfigId");
        bp.fileSizeBytes     = d.getLong("fileSizeBytes");
        bp.metadataJson      = d.getString("metadataJson");
        bp.createdAt         = parseInstant(d.getString("createdAt"));
        bp.updatedAt         = parseInstant(d.getString("updatedAt"));
        List<Document> hist  = d.getList("history", Document.class);
        if (hist != null) hist.forEach(h -> bp.history.add(HistoryEntry.fromDocument(h)));
        return bp;
    }

    Document toDoc(BatchProcess bp) {
        Document d = new Document();
        if (bp.id != null)              d.put("_id",               bp.id);
        if (bp.fileName != null)        d.put("fileName",           bp.fileName);
        if (bp.bucketUri != null)       d.put("bucketUri",          bp.bucketUri);
        if (bp.batchResourceName != null) d.put("batchResourceName", bp.batchResourceName);
        if (bp.state != null)           d.put("state",              bp.state.name());
        if (bp.errorMessage != null)    d.put("errorMessage",       bp.errorMessage);
        if (bp.sparkJobId != null)      d.put("sparkJobId",         bp.sparkJobId);
        if (bp.bucketConfigId != null)  d.put("bucketConfigId",     bp.bucketConfigId);
        if (bp.fileSizeBytes != null)   d.put("fileSizeBytes",      bp.fileSizeBytes);
        if (bp.metadataJson != null)    d.put("metadataJson",       bp.metadataJson);
        if (bp.createdAt != null)       d.put("createdAt",          bp.createdAt.toString());
        if (bp.updatedAt != null)       d.put("updatedAt",          bp.updatedAt.toString());
        List<Document> hist = new ArrayList<>();
        if (bp.history != null) bp.history.forEach(h -> hist.add(h.toDocument()));
        d.put("history", hist);
        return d;
    }

    private static final Set<String> SORTABLE =
        Set.of("fileName", "state", "createdAt", "updatedAt", "bucketUri");

    private String safeSort(String s) { return SORTABLE.contains(s) ? s : "createdAt"; }

    static Instant parseInstant(String s) {
        try { return s != null ? Instant.parse(s) : null; } catch (Exception e) { return null; }
    }

    // -- Metodi aggiuntivi per JobType.SCHEDULED -------------------------------

    /**
     * SCHEDULED_PENDING -> SPARK_SUBMITTED (atomico).
     * Usato da {@link com.example.sbm.scheduler.ScheduledJobLauncher}.
     */
    public boolean transitionFromScheduledPendingToSubmitted(
            String id, String batchResourceName, String sparkJobId, HistoryEntry entry) {
        if (!ObjectId.isValid(id)) return false;
        var update = Updates.combine(
            Updates.set("state",             BatchState.SPARK_SUBMITTED.name()),
            Updates.set("batchResourceName", batchResourceName),
            Updates.set("sparkJobId",        sparkJobId),
            Updates.set("startedAt",         Instant.now().toString()),
            Updates.set("updatedAt",         Instant.now().toString()),
            Updates.push("history",          entry.toDocument())
        );
        return atomicTransition(id, BatchState.SCHEDULED_PENDING, update);
    }

    /**
     * Conta le istanze attive (non terminali) di una specifica JobDefinition.
     * Usato per il controllo di concorrenza nel launcher.
     */
    public long countActiveByJobDefinition(String jobDefinitionId) {
        return col().countDocuments(Filters.and(
            Filters.eq("jobDefinitionId", jobDefinitionId),
            Filters.in("state", List.of(
                BatchState.SCHEDULED_PENDING.name(),
                BatchState.SPARK_SUBMITTED.name()
            ))
        ));
    }

    /**
     * Aggiorna le informazioni di output dopo il completamento.
     * Valorizza {@code outputPath}, {@code outputRecordCount}, {@code finishedAt}.
     */
    public boolean updateOutputInfo(String id, String outputPath,
                                     Long recordCount, HistoryEntry entry) {
        if (!ObjectId.isValid(id)) return false;
        Instant now = Instant.now();
        var update = Updates.combine(
            Updates.set("outputPath",        outputPath),
            Updates.set("outputRecordCount", recordCount),
            Updates.set("finishedAt",        now.toString()),
            Updates.set("updatedAt",         now.toString()),
            Updates.push("history",          entry.toDocument())
        );
        var filter = Filters.and(
            Filters.eq("_id",   new ObjectId(id)),
            Filters.eq("state", BatchState.COMPLETED.name())
        );
        return col().updateOne(filter, update).getModifiedCount() > 0;
    }
}
