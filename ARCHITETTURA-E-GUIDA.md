# Spark Batch Monitor — Architettura e Guida Completa

**Versione 2.0** | Quarkus 3.15 · MongoDB · GCP Dataproc Serverless · React 18

---

## Indice

1. [Panoramica del sistema](#1-panoramica)
2. [Tipi di job gestiti](#2-tipi-di-job)
3. [State machine completa](#3-state-machine)
4. [Architettura backend](#4-architettura-backend)
5. [Architettura frontend](#5-architettura-frontend)
6. [Guida configurazione: job schedulati a orario](#6-guida-scheduled)
7. [Guida configurazione: job file-driven](#7-guida-file-driven)
8. [Configurazione avanzata](#8-configurazione-avanzata)
9. [Monitoraggio operativo](#9-monitoraggio)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Panoramica

Spark Batch Monitor è un sistema di **monitoraggio e gestione centralizzata**
dei job Apache Spark eseguiti su GCP Dataproc Serverless.

Il sistema risolve tre problemi operativi:

| Problema | Soluzione |
|---|---|
| "Non so se il job delle 02:00 è partito" | Ogni esecuzione genera un BatchProcess tracciato |
| "Non so se il file caricato è stato elaborato" | Trigger automatico all'arrivo del file |
| "Il job è fallito ma nessuno lo sapeva" | Alert su FAILED via email/webhook |

### Componenti principali

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React 18)                     │
│  Dashboard · Inquiry · Job Definitions · Statistiche         │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API /api
┌──────────────────────▼──────────────────────────────────────┐
│                   BACKEND (Quarkus 3.15)                     │
│                                                              │
│  ┌──────────────────┐  ┌───────────────────────────────┐    │
│  │ ScheduledJob     │  │ SparkMonitoring               │    │
│  │ Launcher         │  │ Scheduler                     │    │
│  │ (ogni 1 min)     │  │ (ogni 30 sec)                 │    │
│  │ Avvia job cron   │  │ Polling GCP, timeout          │    │
│  └────────┬─────────┘  └───────────────┬───────────────┘    │
│           │                            │                     │
│  ┌────────▼────────────────────────────▼───────────────┐    │
│  │              MongoDB (spark_monitor_db)               │    │
│  │  job_definitions   batch_processes   bucket_configs  │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│               GCP Dataproc Serverless                        │
│  Esegue gli script PySpark/Scala                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Tipi di job

### 2.1 SCHEDULED — job a orario fisso

Un job **SCHEDULED** parte a una o più ore prefissate, non dipende da file in input.
Scrive il suo output su un bucket GCS/S3 e/o aggiorna un database.

**Esempi tipici:**
- Report giornaliero delle vendite → GCS (ogni giorno alle 02:00)
- Aggregazione settimanale KPI → BigQuery (ogni lunedì alle 03:00)
- Snapshot anagrafica clienti → GCS + MongoDB (primo del mese a mezzanotte)
- Riconciliazione contabile → PostgreSQL (ogni giorno alle 06:00 e 18:00)

**Come funziona:**
1. Lo `ScheduledJobLauncher` valuta ogni minuto le cron expression di tutte
   le `JobDefinition` abilitate di tipo SCHEDULED.
2. Quando l'orario corrisponde, crea un `BatchProcess` in `SCHEDULED_PENDING`.
3. Sottomette immediatamente il batch a GCP Dataproc.
4. Transiziona il processo a `SPARK_SUBMITTED`.
5. Lo `SparkMonitoringScheduler` monitora il job ogni 30 secondi.

### 2.2 FILE_DRIVEN — job attivato da file

Un job **FILE_DRIVEN** parte quando arriva un file in un bucket GCS/S3.
Elabora il file in input, aggiorna un database o scrive un dataset in output.

**Esempi tipici:**
- File transazioni Parquet → aggiornamento BigQuery
- Anagrafica clienti CSV → upsert MongoDB
- File ordini JSON → PostgreSQL + GCS (snapshot + DB)
- Dati sensori IoT → analytics pipeline

**Come funziona:**
1. Un trigger esterno (GCS Eventarc, S3 SNS, o chiamata manuale) chiama
   `POST /api/batch-trigger` con il nome del file e il bucket.
2. Il backend crea un `BatchProcess` in `FILE_RECEIVED`.
3. Sottomette il batch a GCP Dataproc con il file come parametro.
4. Transiziona a `SPARK_SUBMITTED`.
5. Lo scheduler monitora il job ogni 30 secondi.

---

## 3. State machine

### 3.1 Diagramma completo

```
══════════════════════════════════════════════════════════════
 TIPO: SCHEDULED
══════════════════════════════════════════════════════════════

 [cron orario raggiunto]
          │  ScheduledJobLauncher (tick ogni 1 min)
          ▼
  SCHEDULED_PENDING ──────────────────────────────────┐
          │                                           │ errore
          │  submit a Dataproc                        │ sottomissione
          ▼                                           ▼
  SPARK_SUBMITTED                                   FAILED
          │    ◄── polling SparkMonitoringScheduler
          │         ogni 30 secondi
          │
    ┌─────┴──────┐
    │            │
    ▼            ▼
COMPLETED      FAILED
               │
               └──► SCHEDULED_PENDING (retry automatico se maxRetries > 0)


══════════════════════════════════════════════════════════════
 TIPO: FILE_DRIVEN
══════════════════════════════════════════════════════════════

 [file arriva nel bucket]
          │  GcsTriggerResource (POST /api/batch-trigger)
          │  oppure trigger da frontend
          ▼
  FILE_RECEIVED
          │  submit a Dataproc
          ▼
  SPARK_SUBMITTED
          │    ◄── polling SparkMonitoringScheduler
          │         ogni 30 secondi
          │
    ┌─────┴──────┐
    │            │
    ▼            ▼
COMPLETED      FAILED
               │
               └──► FILE_RECEIVED (resubmit manuale)
```

### 3.2 Tabella delle transizioni

| DA → A | Chi la esegue | Condizione |
|---|---|---|
| `null → FILE_RECEIVED` | `GcsTriggerResource` | File arrivato nel bucket |
| `null → SCHEDULED_PENDING` | `ScheduledJobLauncher` | Cron orario raggiunto |
| `FILE_RECEIVED → SPARK_SUBMITTED` | `GcsTriggerResource` | Submit Dataproc OK |
| `SCHEDULED_PENDING → SPARK_SUBMITTED` | `ScheduledJobLauncher` | Submit Dataproc OK |
| `SCHEDULED_PENDING → FAILED` | `ScheduledJobLauncher` | Errore submit Dataproc |
| `SPARK_SUBMITTED → COMPLETED` | `SparkMonitoringScheduler` | GCP: SUCCEEDED |
| `SPARK_SUBMITTED → FAILED` | `SparkMonitoringScheduler` | GCP: FAILED/CANCELLED |
| `SPARK_SUBMITTED → FAILED` | `SparkMonitoringScheduler` | Timeout superato |
| `FAILED → FILE_RECEIVED` | `BatchProcessResource` (API) | Resubmit manuale |
| `FAILED → SCHEDULED_PENDING` | `BatchProcessResource` (API) | Retry (SCHEDULED) |

### 3.3 Stati e loro significato

| Stato | Tipo | Descrizione |
|---|---|---|
| `FILE_RECEIVED` | FILE_DRIVEN | File nel bucket, job non ancora avviato |
| `SCHEDULED_PENDING` | SCHEDULED | Finestra cron raggiunta, submit in corso |
| `SPARK_SUBMITTED` | Entrambi | Job in esecuzione su GCP Dataproc |
| `COMPLETED` | Entrambi | Job terminato con successo (terminale) |
| `FAILED` | Entrambi | Job fallito (terminale, rilanciabile) |

---

## 4. Architettura backend

### 4.1 Struttura dei file Java

```
services/batch-service/src/main/java/com/example/sbm/
│
├── model/
│   ├── BatchState.java          ← enum stati (FILE_RECEIVED, SCHEDULED_PENDING,
│   │                               SPARK_SUBMITTED, COMPLETED, FAILED)
│   ├── JobType.java             ← enum SCHEDULED | FILE_DRIVEN
│   ├── OutputMode.java          ← enum BUCKET_WRITE | DATABASE_UPDATE | BUCKET_AND_DATABASE
│   ├── BatchProcess.java        ← documento MongoDB: singola esecuzione
│   ├── JobDefinition.java       ← documento MongoDB: template di job
│   ├── BucketConfig.java        ← documento MongoDB: config bucket
│   └── HistoryEntry.java        ← voce del log storico transizioni
│
├── base/
│   ├── BatchProcessRepository.java   ← CRUD + transizioni atomiche MongoDB
│   ├── JobDefinitionRepository.java  ← CRUD + query per launcher
│   └── BucketConfigRepository.java   ← CRUD + findActive()
│
├── scheduler/
│   ├── SparkMonitoringScheduler.java ← polling GCP ogni 30s (tutti i tipi)
│   ├── ScheduledJobLauncher.java     ← avvio job SCHEDULED a orario
│   └── CronEvaluator.java            ← parser espressioni cron
│
├── client/
│   ├── DataprocClient.java           ← chiamate GCP (@Retry @Timeout @Fallback)
│   ├── DataprocBatchState.java       ← enum stati GCP
│   └── DataprocBatchStatus.java      ← risposta normalizzata GCP
│
├── service/
│   └── NotificationService.java      ← alert email/webhook (stub + TODO prod)
│
├── config/
│   └── MongoIndexInitializer.java    ← crea indici MongoDB all'avvio
│
├── security/
│   └── AuthResource.java             ← JWT login/logout
│
├── BatchProcessResource.java         ← CRUD + stats + state-machine
├── JobDefinitionResource.java        ← CRUD + run-now
├── BucketConfigResource.java         ← CRUD + /active
└── GcsTriggerResource.java           ← webhook bucket + resubmit
```

### 4.2 Collections MongoDB

**`job_definitions`** — template di job

```json
{
  "_id": ObjectId,
  "name": "report-vendite-giornaliero",
  "jobType": "SCHEDULED",
  "category": "reporting",
  "cronExpression": "0 0 2 * * ?",
  "outputMode": "BUCKET_WRITE",
  "outputBucketUri": "gs://reports-bucket/vendite/",
  "sparkMainScript": "gs://scripts/report_vendite.py",
  "sparkArguments": ["--date={date}", "--output={outputBucketUri}"],
  "sparkVersion": "3.5",
  "executorMemory": "8g",
  "executorCores": 4,
  "enabled": true,
  "maxConcurrentRuns": 1,
  "timeoutMinutes": 90,
  "maxRetries": 2,
  "retryDelayMinutes": 10,
  "alertEmails": ["ops@azienda.it"],
  "owner": "team-analytics",
  "tags": ["daily", "vendite"],
  "createdAt": "...", "updatedAt": "..."
}
```

**`batch_processes`** — singola esecuzione

```json
{
  "_id": ObjectId,
  "jobType": "SCHEDULED",
  "jobDefinitionId": "...",
  "state": "COMPLETED",
  "scheduledAt": "2026-06-01T02:00:00Z",
  "startedAt":   "2026-06-01T02:00:03Z",
  "finishedAt":  "2026-06-01T02:18:42Z",
  "batchResourceName": "projects/my-proj/locations/europe-west1/batches/sbm-report-...",
  "outputMode": "BUCKET_WRITE",
  "outputBucketUri": "gs://reports-bucket/vendite/",
  "outputPath": "gs://reports-bucket/vendite/2026-06-01/report.parquet",
  "outputRecordCount": 48293,
  "retryCount": 0,
  "history": [
    {"timestamp":"...", "toState":"SCHEDULED_PENDING", "message":"Cron raggiunta: 0 0 2 * * ?"},
    {"timestamp":"...", "fromState":"SCHEDULED_PENDING", "toState":"SPARK_SUBMITTED", "message":"Job sottomesso..."},
    {"timestamp":"...", "fromState":"SPARK_SUBMITTED", "toState":"COMPLETED", "message":"GCP: SUCCEEDED"}
  ],
  "createdAt":"...", "updatedAt":"..."
}
```

### 4.3 Flusso tick dello scheduler (SparkMonitoringScheduler)

```
ogni 30 secondi
│
├─ findSubmittedForPolling(50)
│    Carica SOLO { _id, batchResourceName, fileName, updatedAt }
│    da MongoDB — proiezione minima, indice { state:1, updatedAt:1 }
│
├─ Per ogni processo in SPARK_SUBMITTED:
│    │
│    ├─ età > timeout? ──► FAILED ("Timeout Superato")
│    │                     + sendTimeoutAlert()
│    │                     (nessuna chiamata GCP)
│    │
│    └─ età ≤ timeout? ──► getBatchStatus(batchResourceName)
│                           │  @Retry(3) @Timeout(10s) @Fallback
│                           │
│                           ├─ SUCCEEDED  ──► transitionToCompleted()
│                           ├─ FAILED     ──► transitionToFailed()
│                           ├─ CANCELLED  ──► transitionToFailed()
│                           ├─ PENDING    ──► skip (riprova al prossimo tick)
│                           ├─ RUNNING    ──► skip (riprova al prossimo tick)
│                           └─ STATE_UNSPECIFIED ──► skip (GCP fallback)
│
└─ concurrentExecution=SKIP (se tick ancora in corso, il nuovo viene saltato)
```

---

## 5. Architettura frontend

### 5.1 Pagine disponibili

| Path | Pagina | Scopo |
|---|---|---|
| `/` | Dashboard | KPI, grafici, navigazione rapida |
| `/job-definitions` | Job Definitions | **Censimento** di tutti i job da monitorare |
| `/processi` | Inquiry Processi | Monitoraggio esecuzioni con drill-down |
| `/nuova-elaborazione` | Nuova Elaborazione | Avvio manuale (singolo + bulk) |
| `/bucket-configs` | Config Bucket | Gestione bucket GCS/S3 |
| `/simulatore` | Trigger & Scheduler | Controllo scheduler, trigger manuale |
| `/statistiche` | Statistiche | Grafici trend, errori, durata media |

### 5.2 Flusso utente tipico

```
Prima volta (setup):
1. Vai su /job-definitions
2. Crea una JobDefinition SCHEDULED con cron expression
   oppure FILE_DRIVEN con bucket input
3. Il sistema inizia a monitorare automaticamente

Operatività quotidiana:
1. Dashboard → vedi KPI e stato generale
2. Inquiry Processi → drill-down su un processo fallito
3. Click "Resubmit" → il job riparte

Avvio manuale file-driven:
1. /nuova-elaborazione
2. Seleziona la JobDefinition o inserisci manualmente
3. Avvia
```

---

## 6. Guida configurazione: job schedulati a orario

### 6.1 Requisiti

- Script PySpark caricato su GCS (es. `gs://scripts-bucket/my_job.py`)
- Bucket GCS/S3 per l'output (se outputMode = BUCKET_WRITE)
- Database GCP raggiungibile da Dataproc (se outputMode = DATABASE_UPDATE)
- Service Account GCP con ruolo `dataproc.editor` e accesso ai bucket

### 6.2 Creare una JobDefinition SCHEDULED

**Da frontend** (`/job-definitions` → ➕ Nuova Job Definition):

**Tab Generale:**
```
Nome:        report-vendite-giornaliero
Tipo Job:    ⏰ Schedulato (cron)
Descrizione: Genera il report aggregato vendite e lo scrive su GCS
Categoria:   reporting
Owner:       team-analytics
Tag:         daily, vendite, report
Abilitato:   ✅
```

**Tab Trigger:**
```
Cron Expression:  0 0 2 * * ?
                  → Ogni giorno alle 02:00
```

Fai click su uno degli esempi per inserirlo automaticamente.

**Tab Output:**
```
Modalità Output:  🪣 Solo Bucket
Output Bucket URI: gs://reports-bucket/vendite/
```

**Tab GCP / Spark:**
```
GCP Project:       my-gcp-project
GCP Region:        europe-west1
Script Spark:      gs://scripts-bucket/report_vendite.py
Argomenti:
  --date={date}
  --output={outputBucketUri}
Versione Spark:    3.5
Executor Memory:   8g
Executor Cores:    4
```

**Tab Comportamento:**
```
Timeout:               90 minuti
Max Esecuzioni Concorrenti: 1
Max Retry Automatici:  2
Attesa tra Retry:      10 minuti
Email Alert:           ops@azienda.it
```

**Da API** (per automazione/GitOps):

```bash
curl -X POST http://localhost:8080/api/job-definitions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":            "report-vendite-giornaliero",
    "jobType":         "SCHEDULED",
    "description":     "Report aggregato vendite giornaliero",
    "category":        "reporting",
    "cronExpression":  "0 0 2 * * ?",
    "outputMode":      "BUCKET_WRITE",
    "outputBucketUri": "gs://reports-bucket/vendite/",
    "gcpProjectId":    "my-gcp-project",
    "gcpRegion":       "europe-west1",
    "sparkMainScript": "gs://scripts-bucket/report_vendite.py",
    "sparkArguments":  ["--date={date}", "--output={outputBucketUri}"],
    "sparkVersion":    "3.5",
    "executorMemory":  "8g",
    "executorCores":   4,
    "enabled":         true,
    "maxConcurrentRuns": 1,
    "timeoutMinutes":  90,
    "maxRetries":      2,
    "retryDelayMinutes": 10,
    "alertEmails":     ["ops@azienda.it"],
    "owner":           "team-analytics",
    "tags":            ["daily", "vendite"]
  }'
```

### 6.3 Esempi di cron expression

| Cron | Descrizione |
|---|---|
| `0 0 2 * * ?` | Ogni giorno alle 02:00 |
| `0 0 2,14 * * ?` | Alle 02:00 e alle 14:00 |
| `0 0 */6 * * ?` | Ogni 6 ore (00, 06, 12, 18) |
| `0 30 8 * * 1-5` | Lun-Ven alle 08:30 |
| `0 0 0 1 * ?` | Il 1° di ogni mese a mezzanotte |
| `0 0 3 * * 1` | Ogni lunedì alle 03:00 |
| `0 0 6,12,18 * * ?` | Tre volte al giorno (06, 12, 18) |

### 6.4 Avvio manuale immediato

Dal frontend: pagina `/job-definitions` → pulsante **▶ Avvia ora** sul job.

Da API:
```bash
curl -X POST http://localhost:8080/api/job-definitions/{id}/run-now \
  -H "Authorization: Bearer $TOKEN"
```

Da frontend: pagina `/simulatore` → tab "Trigger Manuale".

### 6.5 Verificare che il job parta

1. Vai su `/processi`
2. Filtra per stato `SCHEDULED_PENDING` o `SPARK_SUBMITTED`
3. Il job dovrebbe apparire entro 1 minuto dall'orario configurato
4. Dopo alcuni minuti (dipende dalla durata del job) passerà a `COMPLETED`

---

## 7. Guida configurazione: job file-driven

### 7.1 Requisiti

- Bucket GCS/S3 monitorato (il file trigger arriva qui)
- Script PySpark che accetta il path del file come argomento
- Trigger configurato su GCS Eventarc (automatico) o webhook S3

### 7.2 Creare una JobDefinition FILE_DRIVEN

**Tab Generale:**
```
Nome:        etl-transazioni-parquet
Tipo Job:    📁 File-Driven (bucket event)
Descrizione: Elabora file transazioni Parquet, aggiorna DWH BigQuery
Categoria:   etl
Owner:       team-data-eng
```

**Tab Trigger:**
```
Input Bucket URI:  gs://my-bucket/input/
File Pattern:      *.parquet
```

**Tab Output:**
```
Modalità Output:   🗄 Solo Database
Tipo Database:     BigQuery
Dataset Target:    analytics.transactions
Write Mode:        APPEND
```

**Tab GCP / Spark:**
```
Script Spark:  gs://scripts-bucket/etl_transazioni.py
Argomenti:
  --input={inputFile}
  --dataset=analytics.transactions
  --mode=append
```

**Tab Comportamento:**
```
Timeout:              60 minuti
Max Esecuzioni Concorrenti: 3
Max Retry:            1
```

### 7.3 Configurare il trigger GCS Eventarc

Il sistema si aspetta una chiamata HTTP a `POST /api/batch-trigger` quando
arriva un file. Configura GCS Eventarc per chiamare questo endpoint:

```bash
# 1. Crea un Cloud Run service che espone il tuo backend
# 2. Configura Eventarc trigger

gcloud eventarc triggers create sbm-gcs-trigger \
  --location=europe-west1 \
  --destination-run-service=spark-batch-monitor \
  --destination-run-region=europe-west1 \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=my-bucket" \
  --service-account=sbm-sa@my-project.iam.gserviceaccount.com
```

Il Cloud Run riceverà l'evento GCS e dovrà chiamare:

```bash
POST /api/batch-trigger
Content-Type: application/json
Authorization: Bearer <token>

{
  "bucketUri": "gs://my-bucket/input/",
  "fileName":  "transactions_20260601.parquet",
  "fileSizeBytes": 1048576
}
```

### 7.4 Avvio manuale (test e re-elaborazione)

Da frontend (`/nuova-elaborazione`):
1. Seleziona la JobDefinition dalla lista (precompila il bucket)
2. Inserisci il nome del file
3. Avvia

Da API:
```bash
curl -X POST http://localhost:8080/api/batch-trigger \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bucketUri": "gs://my-bucket/input/",
    "fileName":  "transactions_20260601.parquet",
    "fileSizeBytes": 1048576
  }'
```

---

## 8. Configurazione avanzata

### 8.1 Variabili d'ambiente principali

```env
# ── MongoDB ─────────────────────────────────────────────────
MONGO_URI=mongodb://localhost:27017
MONGO_DB=spark_monitor

# ── GCP ─────────────────────────────────────────────────────
GCP_PROJECT_ID=my-gcp-project
GCP_REGION=europe-west1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json

# ── SparkMonitoringScheduler ─────────────────────────────────
SPARK_MONITORING_ENABLED=true
SPARK_MONITORING_CRON=0/30 * * * * ?    # ogni 30 secondi
SPARK_MONITORING_TIMEOUT_MINUTES=120    # timeout 2 ore
SPARK_MONITORING_MAX_PARALLEL=10        # chiamate GCP parallele
SPARK_MONITORING_FETCH_BATCH=50         # job letti per tick

# ── ScheduledJobLauncher ──────────────────────────────────────
SPARK_SCHEDULED_LAUNCHER_ENABLED=true
SPARK_SCHEDULED_LAUNCHER_CRON=0 * * * * ?   # tick ogni minuto
```

### 8.2 Placeholder negli argomenti Spark

Negli argomenti del job Spark puoi usare questi placeholder:

| Placeholder | Sostituito con | Esempio |
|---|---|---|
| `{date}` | Data corrente (yyyyMMdd) | `20260601` |
| `{outputBucketUri}` | URI bucket output della JobDefinition | `gs://reports-bucket/` |
| `{outputDbTarget}` | Dataset/schema target DB | `analytics.daily_sales` |
| `{inputFile}` | Path completo del file in input (FILE_DRIVEN) | `gs://my-bucket/input/data.parquet` |

**Esempio argomenti:**
```
--date={date}
--input-path={inputFile}
--output-path={outputBucketUri}output/{date}/
--target-table={outputDbTarget}
--write-mode=overwrite
```

### 8.3 Configurazione output per tipo di database

**BigQuery:**
```json
{
  "outputDbType":    "BigQuery",
  "outputDbTarget":  "dataset.table",
  "outputWriteMode": "APPEND"
}
```
Script Spark: usa il connector `spark-bigquery-connector`
```python
df.write.format("bigquery").option("table", target).mode(write_mode).save()
```

**PostgreSQL:**
```json
{
  "outputDbType":    "PostgreSQL",
  "outputDbTarget":  "public.orders",
  "outputWriteMode": "UPSERT"
}
```
Script Spark: usa JDBC
```python
df.write.jdbc(url=jdbc_url, table=target, mode=write_mode, properties=props)
```

**MongoDB:**
```json
{
  "outputDbType":    "MongoDB",
  "outputDbTarget":  "analytics.clienti",
  "outputWriteMode": "UPSERT"
}
```
Script Spark: usa il MongoDB Spark Connector
```python
df.write.format("mongodb").option("collection", target).mode(write_mode).save()
```

---

## 9. Monitoraggio operativo

### 9.1 Dashboard — indicatori chiave

| KPI | Cosa indica | Azione se anomalo |
|---|---|---|
| Processi in esecuzione | Job SPARK_SUBMITTED ora | Normale se corrispondono ai job attesi |
| Falliti | Job FAILED non ancora rilavorati | Vai a /processi, filtra FAILED, resubmit |
| Success Rate | % completati su totale | < 90% = analisi errori necessaria |

### 9.2 Inquiry Processi — filtri utili

**Job di oggi falliti:**
- Stato: FAILED
- Data creazione: da oggi

**Job schedulati in attesa:**
- Stato: SCHEDULED_PENDING

**Job in esecuzione da più di 1 ora:**
- Stato: SPARK_SUBMITTED
- (ordina per "Aggiornato" in ordine crescente)

**Export CSV:** usa il pulsante ⬇ CSV per esportare la lista filtrata.

### 9.3 Capire la history di un processo

Apri il drill-down di un BatchProcess. La sezione "Storia Transizioni" mostra
ogni cambio di stato con timestamp e messaggio. Esempio per un job fallito:

```
10:00:00 → SCHEDULED_PENDING  "Job schedulato — orario cron raggiunto: 0 0 10 * * ?"
10:00:03 → SPARK_SUBMITTED    "Job sottomesso a GCP Dataproc. batchResourceName=..."
10:47:22 → FAILED             "GCP Dataproc: FAILED | Dettaglio: SparkException: OOM
                                in stage 3 — Executor memory overhead exceeded"
```

**Diagnosi:** il job ha esaurito la memoria. Soluzioni:
- Aumenta `executorMemory` nella JobDefinition
- Riduci il volume di dati elaborati per esecuzione
- Aumenta `executorCores` per parallelizzare meglio

### 9.4 Resubmit di un job fallito

**Da frontend:**
1. `/processi` → espandi il processo fallito
2. Click **↩ Resubmit**

**Da API:**
```bash
# Per job FILE_DRIVEN
curl -X POST http://localhost:8080/api/batch-trigger/{processId}/resubmit \
  -H "Authorization: Bearer $TOKEN"

# Per job SCHEDULED — ri-crea un nuovo processo
curl -X POST http://localhost:8080/api/job-definitions/{jobDefId}/run-now \
  -H "Authorization: Bearer $TOKEN"
```

---

## 10. Troubleshooting

### Il job SCHEDULED non parte all'orario configurato

**Verifica 1:** Lo `ScheduledJobLauncher` è abilitato?
```bash
curl http://localhost:8080/api/batch-processes/scheduler/status \
  -H "Authorization: Bearer $TOKEN"
```

**Verifica 2:** La JobDefinition è abilitata?
```bash
curl http://localhost:8080/api/job-definitions/{id} \
  -H "Authorization: Bearer $TOKEN"
# Controlla "enabled": true
```

**Verifica 3:** La cron expression è corretta?
Testa la cron su https://crontab.guru (nota: il formato è a 5 campi senza secondi,
ma il sistema usa 6 campi con i secondi come primo campo).

**Verifica 4:** C'è già un'istanza in esecuzione?
```bash
curl "http://localhost:8080/api/batch-processes?state=SPARK_SUBMITTED" \
  -H "Authorization: Bearer $TOKEN"
# Se maxConcurrentRuns=1 e c'è già un job attivo, il launcher salta
```

### Il job si blocca su SPARK_SUBMITTED

**Causa più comune:** errore nella chiamata GCP (API non raggiungibile).

Controlla i log dello scheduler:
```bash
docker compose logs batch-service | grep "SparkMonitoringScheduler" | tail -50
```

Se vedi `FALLBACK attivo per batch ...` significa che le API GCP non
sono raggiungibili. Verifica:
- `GOOGLE_APPLICATION_CREDENTIALS` punta al file SA key corretto
- Il Service Account ha il ruolo `dataproc.viewer`
- Il `GCP_REGION` corrisponde alla regione del batch

### Il job fallisce subito dopo SPARK_SUBMITTED

Il job è partito ma Dataproc ha restituito FAILED quasi immediatamente.
Recupera i dettagli dall'`errorMessage` nel drill-down del processo.

Cause comuni:
- Script non trovato: verifica il path in `sparkMainScript`
- Permessi mancanti: il SA non ha accesso al bucket di input/output
- Argomenti errati: controlla i placeholder e i valori risolti
- Versione Spark incompatibile: prova a cambiare `sparkVersion`

Per ispezionare direttamente i log GCP:
```bash
gcloud dataproc batches describe {batchId} \
  --project={gcpProjectId} \
  --region={gcpRegion}
```

### MongoDB: connessione non disponibile

```bash
docker compose logs mongodb | tail -20
# Verifica che il container sia healthy
docker compose ps
```

Se il container è in crash-loop, verifica lo spazio disco disponibile.

---

*Spark Batch Monitor v2.0 — com.example.sbm*
