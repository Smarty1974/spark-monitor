package com.example.sbm.config;

import com.mongodb.client.MongoClient;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.bson.Document;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Crea gli indici MongoDB necessari all'avvio dell'applicazione.
 *
 * <h3>Indice critico per lo scheduler:</h3>
 * {@code { state: 1, updatedAt: 1 }} - usato da {@code findSubmittedForPolling}.
 * Permette a MongoDB di trovare i documenti SPARK_SUBMITTED in O(k)
 * invece di O(n) dove k << n.
 */
@ApplicationScoped
public class MongoIndexInitializer {

    private static final Logger LOG = Logger.getLogger(MongoIndexInitializer.class);

    @Inject MongoClient mongoClient;

    @ConfigProperty(name = "quarkus.mongodb.database")
    String dbName;

    void onStart(@Observes StartupEvent ev) {
        LOG.info("Inizializzazione indici MongoDB...");
        try {
            var db = mongoClient.getDatabase(dbName);

            // -- batch_processes -----------------------------------------------

            var bp = db.getCollection("batch_processes");

            // CRITICO: usato dal polling scheduler
            bp.createIndex(
                Indexes.ascending("state", "updatedAt"),
                new IndexOptions().name("idx_state_updatedAt").background(true));

            bp.createIndex(
                Indexes.descending("createdAt"),
                new IndexOptions().name("idx_createdAt_desc").background(true));

            bp.createIndex(
                Indexes.ascending("bucketUri"),
                new IndexOptions().name("idx_bucketUri").background(true));

            bp.createIndex(
                Indexes.text("fileName"),
                new IndexOptions().name("idx_fileName_text").background(true));

            // -- bucket_configs ------------------------------------------------

            var bc = db.getCollection("bucket_configs");

            bc.createIndex(
                Indexes.ascending("triggerEnabled"),
                new IndexOptions().name("idx_triggerEnabled").background(true));

            bc.createIndex(
                Indexes.ascending("bucketUri"),
                new IndexOptions().name("idx_bc_bucketUri").unique(true).background(true));

            // -- job_definitions -----------------------------------------------

            var jd = db.getCollection("job_definitions");
            jd.createIndex(
                Indexes.ascending("jobType", "enabled"),
                new IndexOptions().name("idx_jobType_enabled").background(true));
            jd.createIndex(
                Indexes.ascending("name"),
                new IndexOptions().name("idx_jd_name").unique(true).background(true));

            // Indice per concorrenza
            bp.createIndex(
                Indexes.ascending("jobDefinitionId", "state"),
                new IndexOptions().name("idx_jobDef_state").background(true));
            bp.createIndex(
                Indexes.ascending("jobType"),
                new IndexOptions().name("idx_jobType").background(true));

            LOG.info("[OK] Indici MongoDB inizializzati");

        } catch (Exception e) {
            LOG.warnf("Impossibile creare indici MongoDB: %s", e.getMessage());
        }
    }
}
