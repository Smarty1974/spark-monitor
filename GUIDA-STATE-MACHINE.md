# Guida alla State Machine — Spark Batch Monitor

Questa guida spiega come funziona la macchina a stati del progetto e come
aggiungere nuovi stati, transizioni e processi personalizzati.

---

## Indice

1. [Panoramica della State Machine](#1-panoramica)
2. [Struttura dei file coinvolti](#2-struttura-file)
3. [Come funziona una transizione](#3-come-funziona-una-transizione)
4. [Esempio completo: aggiungere lo stato VALIDATING](#4-esempio-validating)
5. [Esempio completo: aggiungere un processo con branch condizionale](#5-esempio-branch)
6. [Configurare il timeout e il polling](#6-configurare-timeout-e-polling)
7. [Aggiornare il frontend](#7-aggiornare-il-frontend)
8. [Checklist riepilogativa](#8-checklist)

---

## 1. Panoramica

La state machine controlla il ciclo di vita di ogni elaborazione batch.
Lo stato corrente è salvato nel campo `state` del documento MongoDB
nella collection `batch_processes`.

### Stati predefiniti

```
                   trigger GCS/S3
                   o manuale
                       │
                       ▼
              ┌─────────────────┐
              │  FILE_RECEIVED  │  Il file è arrivato nel bucket.
              │                 │  Il job Spark non è ancora avviato.
              └────────┬────────┘
                       │  GcsTriggerResource
                       │  oppure POST /{id}/submit
                       ▼
              ┌─────────────────┐
              │ SPARK_SUBMITTED │  Il job è in esecuzione su GCP.
              │                 │  Lo scheduler lo interroga ogni 30s.
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
       ┌────────────┐   ┌──────────┐
       │ COMPLETED  │   │  FAILED  │
       │            │   │          │
       └────────────┘   └────┬─────┘
       (terminale)           │ resubmit manuale
                             ▼
                    ┌─────────────────┐
                    │  FILE_RECEIVED  │
                    └─────────────────┘
```

### Perché le transizioni sono atomiche

Ogni cambio di stato usa un `updateOne` MongoDB con filtro su
`{ _id: <id>, state: <stato_atteso> }`.

Questo garantisce che:
- Se due istanze dello scheduler tentano la stessa transizione
  contemporaneamente, solo la prima ha effetto.
- Se il documento è già nello stato target (es. già COMPLETED),
  l'update non produce effetti (`modified = 0`).
- Ogni transizione è **idempotente**: chiamarla due volte non crea
  dati inconsistenti.

---

## 2. Struttura dei file coinvolti

```
services/batch-service/src/main/java/com/example/sbm/
│
├── model/
│   ├── BatchState.java              ← enum con gli stati
│   └── HistoryEntry.java            ← voce del log storico
│
├── base/
│   └── BatchProcessRepository.java  ← transizioni atomiche MongoDB
│
├── scheduler/
│   └── SparkMonitoringScheduler.java ← polling GCP, timeout
│
├── BatchProcessResource.java        ← API REST (CRUD + endpoint custom)
├── GcsTriggerResource.java          ← webhook bucket → avvia flusso
└── service/
    └── NotificationService.java     ← alert su cambio stato
```

**Frontend:**
```
frontend/src/
├── components/
│   ├── DesignSystem.tsx             ← colori e icone degli stati
│   └── StateMachineDiagram.tsx      ← diagramma SVG interattivo
│
└── api/
    └── pvClient.ts                  ← opzioni filtro per stato
```

---

## 3. Come funziona una transizione

### 3.1 Struttura di una transizione (Backend)

Una transizione è composta da tre elementi:

**a) Il metodo nel repository** (`BatchProcessRepository.java`)

```java
public boolean transitionToCompleted(String id, HistoryEntry entry) {

    // Costruisce l'update MongoDB
    Bson update = Updates.combine(
        Updates.set("state",     BatchState.COMPLETED.name()),  // nuovo stato
        Updates.set("updatedAt", Instant.now().toString()),      // timestamp aggiornamento
        Updates.unset("errorMessage"),                           // pulisce errori precedenti
        Updates.push("history",  entry.toDocument())            // aggiunge voce al log
    );

    // Esegue l'update SOLO se il documento è in SPARK_SUBMITTED
    return atomicTransition(id, BatchState.SPARK_SUBMITTED, update);
}
```

**b) La voce nel log storico** (`HistoryEntry`)

```java
HistoryEntry entry = new HistoryEntry(
    BatchState.SPARK_SUBMITTED,   // stato di partenza
    BatchState.COMPLETED,         // stato di arrivo
    "GCP Dataproc: SUCCEEDED. BatchUUID: abc-123"  // messaggio descrittivo
);
```

**c) Chi chiama la transizione** (es. `SparkMonitoringScheduler.java`)

```java
case SUCCEEDED -> {
    boolean ok = repository.transitionToCompleted(processId, entry);
    if (ok) {
        notificationService.sendCompletionNotification(processId, fileName);
    }
}
```

### 3.2 Il meccanismo atomico interno

```java
// In BatchProcessRepository.java — non modificare questo metodo
private boolean atomicTransition(String id, BatchState stateAtteso, Bson update) {
    var filter = Filters.and(
        Filters.eq("_id",   new ObjectId(id)),
        Filters.eq("state", stateAtteso.name())  // ← CHIAVE: agisce solo se lo stato combacia
    );
    long modified = col().updateOne(filter, update).getModifiedCount();
    return modified > 0;  // false = il documento era già in un altro stato
}
```

---

## 4. Esempio completo: aggiungere lo stato VALIDATING

### Scenario

Vuoi aggiungere una fase di validazione del file prima di inviarlo
a Dataproc. Il nuovo flusso sarà:

```
FILE_RECEIVED → VALIDATING → SPARK_SUBMITTED → COMPLETED
                    │
                    └→ FAILED (file non valido)
```

### Step 1 — Aggiungere lo stato all'enum

**File:** `model/BatchState.java`

```java
public enum BatchState {
    FILE_RECEIVED,
    VALIDATING,       // ← NUOVO
    SPARK_SUBMITTED,
    COMPLETED,
    FAILED
}
```

### Step 2 — Aggiungere le transizioni nel repository

**File:** `base/BatchProcessRepository.java`

Aggiungi due metodi dopo `transitionToSubmitted`:

```java
/**
 * FILE_RECEIVED → VALIDATING
 * Chiamata quando inizia la validazione del file.
 */
public boolean transitionToValidating(String id, HistoryEntry entry) {
    return atomicTransition(id, BatchState.FILE_RECEIVED,
        Updates.combine(
            Updates.set("state",     BatchState.VALIDATING.name()),
            Updates.set("updatedAt", Instant.now().toString()),
            Updates.push("history",  entry.toDocument())
        ));
}

/**
 * VALIDATING → SPARK_SUBMITTED
 * Chiamata quando la validazione è superata con successo.
 */
public boolean transitionFromValidatingToSubmitted(String id,
        String batchResourceName, String sparkJobId, HistoryEntry entry) {
    return atomicTransition(id, BatchState.VALIDATING,
        Updates.combine(
            Updates.set("state",             BatchState.SPARK_SUBMITTED.name()),
            Updates.set("batchResourceName", batchResourceName),
            Updates.set("sparkJobId",        sparkJobId),
            Updates.set("updatedAt",         Instant.now().toString()),
            Updates.push("history",          entry.toDocument())
        ));
}

/**
 * VALIDATING → FAILED
 * Chiamata quando la validazione fallisce.
 */
public boolean transitionFromValidatingToFailed(String id,
        String errorMessage, HistoryEntry entry) {
    return atomicTransition(id, BatchState.VALIDATING,
        Updates.combine(
            Updates.set("state",        BatchState.FAILED.name()),
            Updates.set("errorMessage", errorMessage),
            Updates.set("updatedAt",    Instant.now().toString()),
            Updates.push("history",     entry.toDocument())
        ));
}
```

### Step 3 — Creare il ValidationService

**File nuovo:** `service/ValidationService.java`

```java
package com.example.sbm.service;

import com.example.sbm.base.BatchProcessRepository;
import com.example.sbm.model.BatchState;
import com.example.sbm.model.HistoryEntry;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

@ApplicationScoped
public class ValidationService {

    private static final Logger LOG = Logger.getLogger(ValidationService.class);

    @Inject BatchProcessRepository repository;
    @Inject NotificationService    notificationService;

    /**
     * Valida il file e aggiorna la state machine.
     *
     * @param processId  ID del processo in stato FILE_RECEIVED
     * @param fileName   nome del file da validare
     * @param bucketUri  URI del bucket
     * @return true se la validazione è superata
     */
    public boolean validateAndTransition(String processId,
                                          String fileName,
                                          String bucketUri) {
        // 1. Transizione a VALIDATING
        HistoryEntry startEntry = new HistoryEntry(
            BatchState.FILE_RECEIVED,
            BatchState.VALIDATING,
            "Inizio validazione file: " + fileName
        );
        boolean started = repository.transitionToValidating(processId, startEntry);
        if (!started) {
            LOG.warnf("Impossibile avviare la validazione per %s: stato non FILE_RECEIVED", processId);
            return false;
        }

        // 2. Esegui la validazione (logica custom qui)
        ValidationResult result = runValidation(fileName, bucketUri);

        if (result.isValid()) {
            // 3a. Validazione OK → rimane in VALIDATING
            //     Il chiamante proseguirà con transitionFromValidatingToSubmitted
            LOG.infof("Validazione OK per %s", fileName);
            return true;
        } else {
            // 3b. Validazione FALLITA → FAILED
            HistoryEntry failEntry = new HistoryEntry(
                BatchState.VALIDATING,
                BatchState.FAILED,
                "Validazione fallita: " + result.getErrorMessage()
            );
            repository.transitionFromValidatingToFailed(
                processId, result.getErrorMessage(), failEntry
            );
            notificationService.sendFailureAlert(
                processId, fileName, result.getErrorMessage()
            );
            return false;
        }
    }

    // Implementa qui la tua logica di validazione
    private ValidationResult runValidation(String fileName, String bucketUri) {
        // Esempio: controlla estensione
        if (!fileName.endsWith(".parquet") && !fileName.endsWith(".csv")) {
            return ValidationResult.fail("Formato non supportato: " + fileName);
        }
        // Esempio: controlla che il bucket sia autorizzato
        if (bucketUri.contains("unauthorized-bucket")) {
            return ValidationResult.fail("Bucket non autorizzato: " + bucketUri);
        }
        return ValidationResult.ok();
    }

    // Record helper per il risultato della validazione
    public record ValidationResult(boolean isValid, String errorMessage) {
        public static ValidationResult ok()                { return new ValidationResult(true,  null); }
        public static ValidationResult fail(String msg)    { return new ValidationResult(false, msg);  }
    }
}
```

### Step 4 — Aggiornare il trigger

**File:** `GcsTriggerResource.java`

Modifica il metodo `trigger` per passare per la validazione:

```java
@POST
@RolesAllowed({"user", "admin"})
public Response trigger(TriggerRequest req) {
    // 1. Crea in FILE_RECEIVED (invariato)
    var bp = new BatchProcess();
    bp.fileName  = req.fileName();
    bp.bucketUri = req.bucketUri();
    bp.state     = BatchState.FILE_RECEIVED;
    bpRepo.create(bp);
    String processId = bp.id.toHexString();

    // 2. NUOVO: esegui la validazione
    boolean valid = validationService.validateAndTransition(
        processId, req.fileName(), req.bucketUri()
    );

    if (!valid) {
        // Il ValidationService ha già transizionato a FAILED
        return Response.status(422).entity(Map.of(
            "processId", processId,
            "state",     "FAILED",
            "message",   "File non valido — controlla l'inquiry processi per i dettagli"
        )).build();
    }

    // 3. Validazione OK → sottometti a Dataproc (invariato)
    String batchId           = "sbm-" + processId.substring(0, 8);
    String batchResourceName = submitToDataproc(req, batchId);

    HistoryEntry entry = new HistoryEntry(
        BatchState.VALIDATING,        // ← ora viene da VALIDATING, non FILE_RECEIVED
        BatchState.SPARK_SUBMITTED,
        "Job sottomesso a GCP Dataproc Serverless"
    );
    bpRepo.transitionFromValidatingToSubmitted(processId, batchResourceName, batchId, entry);

    return Response.status(201).entity(Map.of(
        "processId",         processId,
        "batchResourceName", batchResourceName,
        "state",             BatchState.SPARK_SUBMITTED.name()
    )).build();
}

// Non dimenticare di iniettare il servizio:
@Inject ValidationService validationService;
```

---

## 5. Esempio completo: processo con branch condizionale

### Scenario

Hai file che possono essere di due tipi: `STANDARD` e `PRIORITY`.
I file PRIORITY saltano la coda e vanno subito a Dataproc.
I file STANDARD passano per una coda di approvazione manuale.

```
FILE_RECEIVED
      │
      ├─ tipo PRIORITY ──→ SPARK_SUBMITTED → COMPLETED
      │
      └─ tipo STANDARD ──→ PENDING_APPROVAL
                                  │
                     ┌────────────┴────────────┐
                     │                         │
                     ▼ approvato               ▼ rifiutato
             SPARK_SUBMITTED               REJECTED (terminale)
                     │
                     ▼
                 COMPLETED
```

### Step 1 — Enum con i nuovi stati

```java
public enum BatchState {
    FILE_RECEIVED,
    PENDING_APPROVAL,   // ← NUOVO: in attesa di approvazione manuale
    SPARK_SUBMITTED,
    COMPLETED,
    FAILED,
    REJECTED            // ← NUOVO: rifiutato dal revisore (terminale)
}
```

### Step 2 — Transizioni nel repository

```java
// FILE_RECEIVED → PENDING_APPROVAL
public boolean transitionToPendingApproval(String id, HistoryEntry entry) {
    return atomicTransition(id, BatchState.FILE_RECEIVED,
        Updates.combine(
            Updates.set("state",     BatchState.PENDING_APPROVAL.name()),
            Updates.set("updatedAt", Instant.now().toString()),
            Updates.push("history",  entry.toDocument())
        ));
}

// PENDING_APPROVAL → SPARK_SUBMITTED (approvazione manuale via API)
public boolean transitionFromApprovalToSubmitted(String id,
        String batchResourceName, String sparkJobId,
        String approvedBy, HistoryEntry entry) {
    return atomicTransition(id, BatchState.PENDING_APPROVAL,
        Updates.combine(
            Updates.set("state",             BatchState.SPARK_SUBMITTED.name()),
            Updates.set("batchResourceName", batchResourceName),
            Updates.set("sparkJobId",        sparkJobId),
            Updates.set("approvedBy",        approvedBy),   // campo custom su BatchProcess
            Updates.set("updatedAt",         Instant.now().toString()),
            Updates.push("history",          entry.toDocument())
        ));
}

// PENDING_APPROVAL → REJECTED
public boolean transitionToRejected(String id,
        String reason, String rejectedBy, HistoryEntry entry) {
    return atomicTransition(id, BatchState.PENDING_APPROVAL,
        Updates.combine(
            Updates.set("state",        BatchState.REJECTED.name()),
            Updates.set("errorMessage", "Rifiutato da " + rejectedBy + ": " + reason),
            Updates.set("updatedAt",    Instant.now().toString()),
            Updates.push("history",     entry.toDocument())
        ));
}
```

### Step 3 — Endpoint di approvazione/rifiuto

In `BatchProcessResource.java` aggiungi:

```java
public record ApprovalRequest(
    String action,      // "approve" oppure "reject"
    String operator,    // nome del revisore
    String reason       // motivazione (obbligatoria per reject)
) {}

@POST @Path("/{id}/review")
@RolesAllowed("admin")   // solo gli admin possono approvare
public Response reviewProcess(
    @PathParam("id") String id,
    ApprovalRequest req
) {
    return repo.findById(id).map(bp -> {

        // Verifica che il processo sia in attesa di approvazione
        if (bp.state != BatchState.PENDING_APPROVAL) {
            return Response.status(409).entity(Map.of(
                "error", "Il processo non è in stato PENDING_APPROVAL",
                "currentState", bp.state.name()
            )).build();
        }

        if ("approve".equals(req.action())) {
            // Approvazione: sottometti a Dataproc e transiziona
            try {
                String batchId = "sbm-approved-" + id.substring(0, 6);
                // Qui sottometti a Dataproc...
                String brn = "projects/my-proj/locations/europe-west1/batches/" + batchId;

                HistoryEntry entry = new HistoryEntry(
                    BatchState.PENDING_APPROVAL, BatchState.SPARK_SUBMITTED,
                    "Approvato da " + req.operator() + ". Job sottomesso a Dataproc."
                );
                repo.transitionFromApprovalToSubmitted(id, brn, batchId, req.operator(), entry);

                return Response.ok(Map.of(
                    "processId", id,
                    "state",     "SPARK_SUBMITTED",
                    "approvedBy", req.operator()
                )).build();

            } catch (Exception e) {
                return Response.status(500)
                    .entity(Map.of("error", e.getMessage())).build();
            }

        } else if ("reject".equals(req.action())) {
            // Rifiuto: transiziona a REJECTED
            if (req.reason() == null || req.reason().isBlank()) {
                return Response.status(400)
                    .entity(Map.of("error", "La motivazione è obbligatoria per il rifiuto"))
                    .build();
            }
            HistoryEntry entry = new HistoryEntry(
                BatchState.PENDING_APPROVAL, BatchState.REJECTED,
                "Rifiutato da " + req.operator() + ": " + req.reason()
            );
            repo.transitionToRejected(id, req.reason(), req.operator(), entry);

            return Response.ok(Map.of(
                "processId",  id,
                "state",      "REJECTED",
                "rejectedBy", req.operator(),
                "reason",     req.reason()
            )).build();

        } else {
            return Response.status(400)
                .entity(Map.of("error", "action deve essere 'approve' o 'reject'"))
                .build();
        }

    }).orElse(Response.status(404).entity(Map.of("error", "Processo non trovato")).build());
}
```

---

## 6. Configurare timeout e polling

Il file di configurazione è:

```
services/batch-service/src/main/resources/application.properties
```

Oppure le variabili d'ambiente nel file `.env` nella root del progetto.

### Parametri disponibili

```properties
# Abilita/disabilita il polling (true/false)
spark.monitoring.enabled=true

# Cron expression — ogni 30 secondi
spark.monitoring.cron=0/30 * * * * ?

# Timeout: dopo quanti minuti un job in SPARK_SUBMITTED
# viene forzato a FAILED (default: 120 = 2 ore)
spark.monitoring.timeout-minutes=120

# Quanti job leggere da MongoDB per ogni tick dello scheduler
# (evita di caricare tutta la collection in memoria)
spark.monitoring.fetch-batch-size=50

# Quante chiamate GCP fare in parallelo per tick
spark.monitoring.max-parallel=10
```

### Esempi di configurazione per casi d'uso diversi

**Job veloci (< 10 minuti):**
```properties
spark.monitoring.cron=0/10 * * * * ?    # polling ogni 10 secondi
spark.monitoring.timeout-minutes=30     # timeout dopo 30 minuti
```

**Job lunghi (ore/giorni):**
```properties
spark.monitoring.cron=0 0/5 * * * ?     # polling ogni 5 minuti
spark.monitoring.timeout-minutes=1440   # timeout dopo 24 ore
```

**Alto volume (molti job paralleli):**
```properties
spark.monitoring.fetch-batch-size=200   # leggi fino a 200 job per tick
spark.monitoring.max-parallel=20        # 20 chiamate GCP parallele
```

### Come funziona il circuit breaker logico

Lo scheduler in `SparkMonitoringScheduler.java` controlla l'età del
job **prima** di chiamare GCP. Se il job è più vecchio del timeout,
non viene effettuata nessuna chiamata all'API Google:

```
Tick scheduler (ogni 30s)
│
├─ findSubmittedForPolling(50)
│    └─ carica solo { _id, batchResourceName, fileName, updatedAt }
│       (proiezione minima — non carica l'array history)
│
├─ Per ogni job:
│    │
│    ├─ age > timeout? ──→ transitionToFailed("Timeout Superato")
│    │                      + sendTimeoutAlert()
│    │                      (nessuna chiamata GCP)
│    │
│    └─ age <= timeout? ──→ getBatchStatus(batchResourceName)
│                            │
│                            ├─ SUCCEEDED  → transitionToCompleted()
│                            ├─ FAILED     → transitionToFailed()
│                            ├─ CANCELLED  → transitionToFailed()
│                            ├─ PENDING    → skip (riprova al prossimo tick)
│                            ├─ RUNNING    → skip (riprova al prossimo tick)
│                            └─ fallback   → skip (API GCP non raggiungibile)
│
└─ concurrentExecution=SKIP
     Se questo tick è ancora in corso quando scatta il prossimo,
     il nuovo tick viene saltato.
```

---

## 7. Aggiornare il frontend

Ogni volta che aggiungi uno stato devi aggiornare **due file** nel frontend.

### 7.1 DesignSystem.tsx — colori e icone

**File:** `frontend/src/components/DesignSystem.tsx`

```typescript
// Aggiungi il tipo
export type BatchState =
  | 'FILE_RECEIVED'
  | 'VALIDATING'        // ← NUOVO
  | 'PENDING_APPROVAL'  // ← NUOVO
  | 'SPARK_SUBMITTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'          // ← NUOVO

// Aggiungi la configurazione visiva
export const STATE_CONFIG: Record<BatchState, { label: string; tone: Tone; icon: string }> = {
  FILE_RECEIVED:   { label: 'File Ricevuto',      tone: 'blue',   icon: '📥' },
  VALIDATING:      { label: 'In Validazione',     tone: 'purple', icon: '🔎' }, // ← NUOVO
  PENDING_APPROVAL:{ label: 'Attende Approvazione',tone:'amber',  icon: '⏳' }, // ← NUOVO
  SPARK_SUBMITTED: { label: 'Spark Avviato',      tone: 'orange', icon: '⚡' },
  COMPLETED:       { label: 'Completato',          tone: 'green',  icon: '✅' },
  FAILED:          { label: 'Fallito',             tone: 'red',    icon: '❌' },
  REJECTED:        { label: 'Rifiutato',           tone: 'gray',   icon: '🚫' }, // ← NUOVO
}
```

### 7.2 StateMachineDiagram.tsx — nodi e frecce

**File:** `frontend/src/components/StateMachineDiagram.tsx`

```typescript
// Posiziona i nuovi nodi con coordinate x/y
// La SVG è 740×310 pixel
const NODES = [
  { id:'FILE_RECEIVED',    x:40,  y:130, label:'File Ricevuto',       icon:'📥', color:'#1565c0' },
  { id:'VALIDATING',       x:200, y:130, label:'In Validazione',      icon:'🔎', color:'#6a1b9a' }, // ← NUOVO
  { id:'PENDING_APPROVAL', x:200, y:240, label:'Attende Approvazione',icon:'⏳', color:'#f57f17' }, // ← NUOVO
  { id:'SPARK_SUBMITTED',  x:380, y:130, label:'Spark Avviato',       icon:'⚡', color:'#e65100' },
  { id:'COMPLETED',        x:560, y:60,  label:'Completato',          icon:'✅', color:'#1b5e20' },
  { id:'FAILED',           x:560, y:200, label:'Fallito',             icon:'❌', color:'#b71c1c' },
  { id:'REJECTED',         x:560, y:280, label:'Rifiutato',           icon:'🚫', color:'#555'    }, // ← NUOVO
]

// Aggiungi le frecce delle nuove transizioni
const EDGES = [
  { f:'FILE_RECEIVED',    t:'VALIDATING',       lbl:'Avvia validazione', trigger:'Automatico',       dash:false },
  { f:'VALIDATING',       t:'SPARK_SUBMITTED',  lbl:'Validazione OK',    trigger:'ValidationService', dash:false },
  { f:'VALIDATING',       t:'FAILED',           lbl:'Validazione KO',    trigger:'ValidationService', dash:true  },
  // ... oppure per il branch approvazione:
  { f:'FILE_RECEIVED',    t:'PENDING_APPROVAL', lbl:'Standard',          trigger:'Automatico',        dash:false },
  { f:'PENDING_APPROVAL', t:'SPARK_SUBMITTED',  lbl:'Approvato',         trigger:'Revisore (API)',    dash:false },
  { f:'PENDING_APPROVAL', t:'REJECTED',         lbl:'Rifiutato',         trigger:'Revisore (API)',    dash:true  },
  { f:'SPARK_SUBMITTED',  t:'COMPLETED',        lbl:'GCP: SUCCEEDED',    trigger:'Scheduler 30s',    dash:false },
  { f:'SPARK_SUBMITTED',  t:'FAILED',           lbl:'GCP: FAILED',       trigger:'Scheduler 30s',    dash:false },
  { f:'SPARK_SUBMITTED',  t:'FAILED',           lbl:'Timeout',           trigger:'Circuit Breaker',  dash:true  },
]
```

### 7.3 pvClient.ts — filtri di ricerca

**File:** `frontend/src/api/pvClient.ts`

Nel file `InquiryProcessi.tsx`, aggiorna le opzioni del filtro stato:

```typescript
const SEARCH_FIELDS: FieldDef[] = [
  // ...
  {
    key: 'state',
    label: 'STATO',
    type: 'select',
    options: [
      { value: 'FILE_RECEIVED',    label: '📥 File Ricevuto' },
      { value: 'VALIDATING',       label: '🔎 In Validazione' },       // ← NUOVO
      { value: 'PENDING_APPROVAL', label: '⏳ Attende Approvazione' }, // ← NUOVO
      { value: 'SPARK_SUBMITTED',  label: '⚡ Spark Avviato' },
      { value: 'COMPLETED',        label: '✅ Completato' },
      { value: 'FAILED',           label: '❌ Fallito' },
      { value: 'REJECTED',         label: '🚫 Rifiutato' },            // ← NUOVO
    ]
  },
  // ...
]
```

---

## 8. Checklist riepilogativa

Usa questa checklist ogni volta che aggiungi uno stato alla state machine.

### Backend

- [ ] `model/BatchState.java` — aggiungere il valore all'enum
- [ ] `base/BatchProcessRepository.java` — aggiungere i metodi di transizione
- [ ] Implementare il servizio che chiama la transizione (es. `ValidationService.java`)
- [ ] Aggiornare i punti di ingresso del flusso (es. `GcsTriggerResource.java`)
- [ ] Se lo stato richiede un'azione manuale: aggiungere l'endpoint in `BatchProcessResource.java`
- [ ] Aggiornare `getStateMachineDefinition()` in `BatchProcessResource.java`
- [ ] Se lo stato deve essere sorvegliato dal polling: aggiornare `SparkMonitoringScheduler.java`

### Frontend

- [ ] `components/DesignSystem.tsx` — aggiungere tipo, colore e icona
- [ ] `components/StateMachineDiagram.tsx` — aggiungere nodo e frecce
- [ ] `pages/InquiryProcessi.tsx` — aggiungere opzione nel filtro stato
- [ ] `dashboard/SbmDashboard.tsx` — aggiungere alla stat-card se necessario
- [ ] Se lo stato richiede azioni: aggiungere bottoni nella `jumpBar` del drill-down

### Test

```bash
# Verifica che la transizione sia raggiungibile via API
curl -X POST http://localhost:8080/api/batch-processes/<id>/review \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "action": "approve", "operator": "mario.rossi", "reason": "" }'

# Verifica che il documento MongoDB abbia lo stato corretto
mongosh spark_monitor --eval "
  db.batch_processes.findOne(
    { _id: ObjectId('<id>') },
    { state: 1, history: 1, updatedAt: 1 }
  )
"
```

---

*Documento generato per spark-batch-monitor v2.0 — com.example.sbm*
