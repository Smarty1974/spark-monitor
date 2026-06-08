package com.example.sbm.model;

import org.bson.Document;
import java.time.Instant;

/**
 * Singola transizione di stato registrata nell'array {@code history}
 * del documento MongoDB.
 */
public class HistoryEntry {

    public Instant timestamp;
    public String  fromState;   // null alla creazione
    public String  toState;
    public String  message;

    public HistoryEntry() {}

    public HistoryEntry(BatchState from, BatchState to, String message) {
        this.timestamp = Instant.now();
        this.fromState = from != null ? from.name() : null;
        this.toState   = to.name();
        this.message   = message;
    }

    public Document toDocument() {
        return new Document()
            .append("timestamp", timestamp != null ? timestamp.toString() : Instant.now().toString())
            .append("fromState", fromState)
            .append("toState",   toState)
            .append("message",   message);
    }

    public static HistoryEntry fromDocument(Document d) {
        var e = new HistoryEntry();
        String ts = d.getString("timestamp");
        e.timestamp = ts != null ? Instant.parse(ts) : null;
        e.fromState = d.getString("fromState");
        e.toState   = d.getString("toState");
        e.message   = d.getString("message");
        return e;
    }
}
