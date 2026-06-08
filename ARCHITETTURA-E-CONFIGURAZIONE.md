# Spark Batch Monitor — Architettura e Guida alla Configurazione

**Versione**: 2.0 | **Stack**: Quarkus 3.15 · MongoDB · GCP Dataproc Serverless · React 18

---

## Indice

1. [Panoramica del sistema](#1-panoramica-del-sistema)
2. [Tipi di job supportati](#2-tipi-di-job-supportati)
3. [Modello dati MongoDB](#3-modello-dati-mongodb)
4. [Macchina a stati unificata](#4-macchina-a-stati-unificata)
5. [Componenti backend](#5-componenti-backend)
6. [Frontend — pagine e funzioni](#6-frontend-pagine-e-funzioni)
7. [Guida passo-passo: configurare un job SCHEDULED](#7-guida-scheduled)
8. [Guida passo-passo: configurare un job FILE_DRIVEN](#8-guida-file-driven)
9. [Variabili di configurazione](#9-variabili-di-configurazione)
10. [API Reference](#10-api-reference)
11. [FAQ e troubleshooting](#11-faq)

---

## 1. Panoramica del sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SPARK BATCH MONITOR                              │
│                                                                         │
│   TRIGGER                  BACKEND                    MONITORING         │
│                                                                         │
│  ┌──────────┐    ┌─────────────────────────┐    ┌──────────────────┐   │
│  │ Cron     │───▶│  ScheduledJobLauncher   │    │ SparkMonitoring  │   │
│  │ (orario) │    │  (tick ogni minuto)     │    │ Scheduler        │   │
│  └──────────┘    └────────────┬────────────┘    │ (tick ogni 30s)  │   │
│                               │                  └────────┬─────────┘   │
│  ┌──────────┐    ┌────────────▼────────────┐             │             │
│  │ GCS/S3   │───▶│  GcsTriggerResource     │    ┌────────▼─────────┐   │
│  │ (file)   │    │  (webhook/manuale)      │    │  DataprocClient  │   │
│  └──────────┘    └────────────┬────────────┘    │  @Retry @Timeout │   │
│                               │                  │  @Fallback       │   │
│  ┌──────────┐    ┌────────────▼────────────┐    └────────┬─────────┘   │
│  │ Frontend │───▶│  BatchProcessResource   │             │             │
│  │ (manuale)│    │  (CRUD + stato)         │             │             │
│  └──────────┘    └────────────┬────────────┘    ┌────────▼─────────┐   │
│                               │                  │  GCP Dataproc    │   │
│                  ┌────────────▼────────────┐    │  Serverless      │   │
│                  │  MongoDB                │◀───│  (job Spark)     │   │
│                  │  spark_monitor          │    └──────────────────┘   │
│                  │  · batch_processes      │                            │
│                  │  · job_definitions      │                            │
│                  │  · bucket_configs       │                            │
│                  └─────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flusso di esecuzione — visione d'insieme

1. **Censimento**: l'utente crea una `JobDefinition` dal frontend (pagina
   *Gestione Job*) specificando tipo, trigger, output e parametri Dataproc.

2. **Avvio**: il trigger (cron o file) crea un `BatchProcess` in MongoDB
   e lo sottomette a GCP Dataproc Serverless.

3. **Monitoraggio**: lo `SparkMonitoringScheduler` interroga ogni 30 s
   l'API GCP e aggiorna lo stato del `BatchProcess` in MongoDB.

4. **Osservabilità**: il frontend mostra in tempo reale lo stato di ogni
   esecuzione con storico transizioni, output prodotto e metriche.

---

## 2. Tipi di job supportati

Il sistema gestisce **due categorie** di job Spark, identificate dal campo
`jobType` nella `JobDefinition`.

### 2.1 Job SCHEDULED — trigger temporale (cron)

**Caratteristiche:**
- Partono automaticamente a orari configurati (es. ogni giorno alle 02:00).
- **Non hanno file in input** da bucket.
- **Scrivono output** su bucket GCS/S3 (file Parquet, CSV, JSON…).
- Tipici casi d'uso: report giornalieri, aggregazioni notturne,
  snapshot periodici, data mart refresh.

**Flusso stati:**
```
[orario cron raggiunto]
         │
         ▼
SCHEDULED_PENDING ──▶ SPARK_SUBMITTED ──▶ COMPLETED
                                    └───▶ FAILED
```

**Esempio concreto:**
```
Job: "report-vendite-giornaliero"
Cron: "0 0 2 * * ?" (ogni giorno alle 02:00)
Script: gs://scripts/report_vendite.py
Output: gs://output-bucket/reports/vendite/YYYYMMDD/
```

Ogni notte alle 02:00 lo `ScheduledJobLauncher`:
1. Rileva che la cron expression è soddisfatta.
2. Verifica che non ci sia già un'esecuzione in corso.
3. Crea il `BatchProcess` in `SCHEDULED_PENDING`.
4. Sottomette il job a Dataproc con `--date=20260601 --output=gs://...`
5. Transiziona a `SPARK_SUBMITTED`.

### 2.2 Job FILE_DRIVEN — trigger file su bucket

**Caratteristiche:**
- Partono all'arrivo di un file in un bucket GCS o S3.
- **Leggono il file come input**.
- Possono avere tre modalità di output:
  - `BUCKET_WRITE`: scrivono file elaborati su un bucket di destinazione.
  - `DATABASE_UPDATE`: aggiornano un database (BigQuery, PostgreSQL, ecc.).
  - `BUCKET_AND_DATABASE`: fanno entrambe le cose.
- Tipici casi d'uso: ETL, caricamento anagrafiche, elaborazione transazioni,
  integrazione con sistemi esterni.

**Flusso stati:**
```
[file arrivato nel bucket]
         │
         ▼
FILE_RECEIVED ──▶ SPARK_SUBMITTED ──▶ COMPLETED
                              └───▶ FAILED
```

**Esempio 1 — Aggiornamento database:**
```
Job: "aggiornamento-anagrafica-clienti"
Input bucket: gs://input-bucket/clienti/
File pattern: clienti_*.csv
Output: DATABASE_UPDATE → PostgreSQL: public.clienti (UPSERT)
```

Quando arriva `clienti_20260601_001.csv` nel bucket:
1. Il webhook GCS/Eventarc chiama `POST /api/batch-trigger`.
2. Il sistema crea `BatchProcess` in `FILE_RECEIVED`.
3. Sottomette il job a Dataproc con `--input=gs://.../.../clienti_20260601_001.csv`
4. Il job Spark legge il CSV, esegue la logica di validazione e UPSERT nel DB.

**Esempio 2 — Scrittura dataset + update DB:**
```
Job: "etl-transazioni-banca"
Input bucket: gs://input-bucket/transazioni/
File pattern: trans_*.parquet
Output: BUCKET_AND_DATABASE
  → Bucket: gs://output-bucket/transazioni-elaborati/
  → BigQuery: analytics.movimenti (APPEND)
```

---

## 3. Modello dati MongoDB

### Collection: `job_definitions`

Ogni documento rappresenta un **template di job** configurato dall'utente.

```json
{
  "_id": ObjectId("..."),

  "name": "report-vendite-giornaliero",
  "description": "Report aggregato delle vendite. Scrive Parquet su GCS.",
  "jobType": "SCHEDULED",
  "category": "reporting",

  // ── TRIGGER (per SCHEDULED) ─────────────────────────────────────────
  "cronExpression": "0 0 2 * * ?",

  // ── TRIGGER (per FILE_DRIVEN) ────────────────────────────────────────
  // "inputBucketUri": "gs://input-bucket/clienti/",
  // "filePattern": "clienti_*.csv",

  // ── OUTPUT ─────────────────────────────────────────────────────────
  "outputMode": "BUCKET_WRITE",
  "outputBucketUri": "gs://output-bucket/reports/vendite/",

  // Per DATABASE_UPDATE o BUCKET_AND_DATABASE:
  // "outputDbType": "BigQuery",
  // "outputDbTarget": "analytics.daily_sales",
  // "outputWriteMode": "APPEND",

  // ── GCP Dataproc ────────────────────────────────────────────────────
  "gcpProjectId": "my-gcp-project",
  "gcpRegion": "europe-west1",
  "sparkMainScript": "gs://scripts/report_vendite.py",
  "sparkArguments": ["--output={outputBucketUri}", "--date={date}"],
  "sparkVersion": "3.5",
  "executorMemory": "4g",
  "executorCores": 2,

  // ── Comportamento ────────────────────────────────────────────────────
  "enabled": true,
  "maxConcurrentRuns": 1,
  "timeoutMinutes": 60,
  "maxRetries": 2,
  "retryDelayMinutes": 5,

  // ── Notifiche ────────────────────────────────────────────────────────
  "alertEmails": ["ops@company.com"],
  "webhookUrl": "https://hooks.slack.com/services/...",

  // ── Metadati ─────────────────────────────────────────────────────────
  "owner": "team-analytics",
  "tags": ["reporting", "daily"],
  "createdAt": "2026-01-10T00:00:00Z",
  "updatedAt": "2026-05-01T00:00:00Z"
}
```

### Collection: `batch_processes`

Ogni documento rappresenta **una singola esecuzione** di un job.
Viene creato automaticamente ad ogni trigger (cron o file).

```json
{
  "_id": ObjectId("..."),

  // ── Classificazione ─────────────────────────────────────────────────
  "jobType": "SCHEDULED",
  "jobDefinitionId": "686abc123...",

  // ── Input (per FILE_DRIVEN) ─────────────────────────────────────────
  "fileName": "clienti_20260601_001.csv",
  "bucketUri": "gs://input-bucket/clienti/",
  "fileSizeBytes": 204800,

  // ── Output (valorizzato dopo COMPLETED) ─────────────────────────────
  "outputMode": "BUCKET_AND_DATABASE",
  "outputBucketUri": "gs://output-bucket/elaborati/",
  "outputPath": "gs://output-bucket/elaborati/20260601/part-00000.parquet",
  "outputDbTarget": "analytics.movimenti",
  "outputRecordCount": 125840,

  // ── GCP Dataproc ────────────────────────────────────────────────────
  "batchResourceName": "projects/my-proj/locations/europe-west1/batches/sbm-...",
  "sparkJobId": "sbm-report-20260601-a1b2c3",

  // ── Timing ──────────────────────────────────────────────────────────
  "scheduledAt": "2026-06-01T02:00:00Z",
  "startedAt":   "2026-06-01T02:00:05Z",
  "finishedAt":  "2026-06-01T02:18:42Z",

  // ── State machine ────────────────────────────────────────────────────
  "state": "COMPLETED",
  "errorMessage": null,
  "retryCount": 0,

  "history": [
    {
      "timestamp": "2026-06-01T02:00:00Z",
      "fromState": null,
      "toState": "SCHEDULED_PENDING",
      "message": "Cron '0 0 2 * * ?' raggiunto"
    },
    {
      "timestamp": "2026-06-01T02:00:05Z",
      "fromState": "SCHEDULED_PENDING",
      "toState": "SPARK_SUBMITTED",
      "message": "Job sottomesso. batchResourceName=projects/..."
    },
    {
      "timestamp": "2026-06-01T02:18:42Z",
      "fromState": "SPARK_SUBMITTED",
      "toState": "COMPLETED",
      "message": "GCP: SUCCEEDED — 48.293 record scritti"
    }
  ],

  "createdAt": "2026-06-01T02:00:00Z",
  "updatedAt": "2026-06-01T02:18:42Z"
}
```

**Indici MongoDB (creati automaticamente all'avvio):**

| Indice | Campi | Uso |
|--------|-------|-----|
| `idx_state_updatedAt` | `{state:1, updatedAt:1}` | Query dello scheduler di polling |
| `idx_createdAt_desc`  | `{createdAt:-1}` | Ordinamento default UI |
| `idx_bucketUri`       | `{bucketUri:1}` | Filtro per bucket |
| `idx_fileName_text`   | `{fileName:"text"}` | Full-text search |

---

## 4. Macchina a stati unificata

```
╔═══════════════════════════════════════════════════════════════════════╗
║              MACCHINA A STATI — SPARK BATCH MONITOR                  ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   JOB SCHEDULED (cron)          JOB FILE_DRIVEN (bucket event)       ║
║                                                                       ║
║   [orario raggiunto]            [file arrivato nel bucket]            ║
║          │                               │                            ║
║          ▼                               ▼                            ║
║   SCHEDULED_PENDING             FILE_RECEIVED                         ║
║          │                               │                            ║
║          │ ScheduledJobLauncher          │ GcsTriggerResource          ║
║          │ (avvio job Dataproc)          │ (avvio job Dataproc)        ║
║          │                               │                            ║
║          └──────────────┬────────────────┘                            ║
║                         │                                             ║
║                         ▼                                             ║
║                  SPARK_SUBMITTED ◄── polling ogni 30s                 ║
║                         │                                             ║
║              ┌──────────┴──────────┐                                  ║
║              │                     │                                  ║
║              ▼                     ▼                                  ║
║          COMPLETED              FAILED                                ║
║       (GCP: SUCCEEDED)     (GCP: FAILED/CANCELLED                    ║
║        — TERMINALE —        oppure timeout 2h)                       ║
║                                   │                                   ║
║                                   │ resubmit manuale                  ║
║                                   ▼                                   ║
║                  FILE_RECEIVED / SCHEDULED_PENDING                    ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Tabella degli stati

| Stato | Tipo job | Significato | Prossimo stato possibile |
|-------|----------|-------------|--------------------------|
| `FILE_RECEIVED` | FILE_DRIVEN | File ricevuto, non ancora avviato | `SPARK_SUBMITTED`, `FAILED` |
| `SCHEDULED_PENDING` | SCHEDULED | Orario cron raggiunto, avvio imminente | `SPARK_SUBMITTED`, `FAILED` |
| `SPARK_SUBMITTED` | Entrambi | Job in esecuzione su GCP Dataproc | `COMPLETED`, `FAILED` |
| `COMPLETED` | Entrambi | Esecuzione terminata con successo | *(terminale)* |
| `FAILED` | Entrambi | Esecuzione fallita o timeout superato | `FILE_RECEIVED`, `SCHEDULED_PENDING` (resubmit) |

### Regole di transizione

| Da | A | Chi la esegue | Condizione |
|----|---|---------------|------------|
| *(null)* | `FILE_RECEIVED` | `GcsTriggerResource` | File rilevato nel bucket |
| *(null)* | `SCHEDULED_PENDING` | `ScheduledJobLauncher` | Cron expression soddisfatta |
| `FILE_RECEIVED` | `SPARK_SUBMITTED` | `GcsTriggerResource` | Job sottomesso a Dataproc |
| `SCHEDULED_PENDING` | `SPARK_SUBMITTED` | `ScheduledJobLauncher` | Job sottomesso a Dataproc |
| `SPARK_SUBMITTED` | `COMPLETED` | `SparkMonitoringScheduler` | GCP risponde `SUCCEEDED` |
| `SPARK_SUBMITTED` | `FAILED` | `SparkMonitoringScheduler` | GCP risponde `FAILED`/`CANCELLED` |
| `SPARK_SUBMITTED` | `FAILED` | `SparkMonitoringScheduler` | Età job > timeout configurato |
| `FAILED` | `FILE_RECEIVED` | API manuale / frontend | Resubmit richiesto dall'utente |
| `FAILED` | `SCHEDULED_PENDING` | Retry automatico | `maxRetries > 0` nella JobDefinition |

---

## 5. Componenti backend

### 5.1 ScheduledJobLauncher

**File:** `scheduler/ScheduledJobLauncher.java`
**Tick:** ogni minuto (`0 * * * * ?`)

Responsabilità:
- Legge tutte le `JobDefinition` abilitate di tipo `SCHEDULED`.
- Per ciascuna valuta se la `cronExpression` è soddisfatta nell'istante corrente
  (mediante `CronEvaluator.shouldRunNow()`).
- Se sì, controlla `maxConcurrentRuns`: salta il lancio se ci sono già
  abbastanza esecuzioni attive per questo job.
- Crea il `BatchProcess` in `SCHEDULED_PENDING`.
- Chiama GCP Dataproc Serverless con lo script e gli argomenti configurati,
  risolvendo i placeholder `{date}`, `{outputBucketUri}`, ecc.
- Transiziona a `SPARK_SUBMITTED`.

**Placeholder negli argomenti Spark:**

| Placeholder | Valore sostituito |
|-------------|-------------------|
| `{date}` | Data corrente formato `yyyyMMdd` (es. `20260601`) |
| `{outputBucketUri}` | Valore di `JobDefinition.outputBucketUri` |
| `{outputDbTarget}` | Valore di `JobDefinition.outputDbTarget` |
| `{inputFile}` | Path completo del file input (solo FILE_DRIVEN) |

### 5.2 SparkMonitoringScheduler

**File:** `scheduler/SparkMonitoringScheduler.java`
**Tick:** ogni 30 secondi (configurabile)

Responsabilità:
- Legge da MongoDB **tutti** i processi in `SPARK_SUBMITTED` (proiezione
  minima: solo `_id`, `batchResourceName`, `fileName`, `updatedAt`).
- Separa i job scaduti (età > `timeoutMinutes`) da quelli ancora validi.
- Per i job scaduti: forza `FAILED` con messaggio "Timeout Superato".
- Per i job attivi: interroga GCP Dataproc in parallelo (max `maxParallel`).
- Applica la transizione MongoDB atomica in base alla risposta GCP.
- Fault isolation: ogni job è in un `try-catch` indipendente.

### 5.3 GcsTriggerResource

**File:** `GcsTriggerResource.java`
**Endpoint:** `POST /api/batch-trigger`

Chiamato da:
- **GCS Eventarc**: Cloud Storage → Eventarc → Cloud Run → questo endpoint.
- **S3 Event Notification**: S3 → SNS → Lambda → questo endpoint.
- **Frontend (Nuova Elaborazione)**: trigger manuale dall'utente.

Flusso interno:
1. Crea `BatchProcess` in `FILE_RECEIVED`.
2. Sottomette il job a Dataproc (usando la `JobDefinition` se presente).
3. Transiziona a `SPARK_SUBMITTED`.

### 5.4 CronEvaluator

**File:** `scheduler/CronEvaluator.java`

Valuta le espressioni cron a 6 campi (formato Quarkus) con granularità al minuto.

**Formato supportato:**
```
  ┌─────── secondi      (ignorati, usare 0)
  │ ┌───── minuti       (0-59)
  │ │ ┌─── ore          (0-23)
  │ │ │ ┌─ giornoMese   (1-31 o ?)
  │ │ │ │ ┌ mese        (1-12)
  │ │ │ │ │ ┌ giornoSett (1-7 oppure ?)
  0 0 2 * * ?
```

**Esempi cron:**

| Espressione | Significato |
|-------------|-------------|
| `0 0 2 * * ?` | Ogni giorno alle 02:00 |
| `0 0 2,14 * * ?` | Alle 02:00 e alle 14:00 |
| `0 0 */6 * * ?` | Ogni 6 ore (00:00, 06:00, 12:00, 18:00) |
| `0 0 * * * ?` | Ogni ora esatta |
| `0 30 8 * * 1-5` | Lun–Ven alle 08:30 |
| `0 0 1 * * 7` | Ogni domenica all'01:00 |
| `0 0 0 1 * ?` | Il primo giorno di ogni mese a mezzanotte |
| `0 0 6 * * 1` | Ogni lunedì alle 06:00 |

### 5.5 DataprocClient

**File:** `client/DataprocClient.java`

Interroga l'API GCP Dataproc con pattern di resilienza:

```
getBatchStatus(batchResourceName)
       │
  @Retry(maxRetries=3, delay=1s, jitter=200ms)
  @Timeout(10s per chiamata)
       │
  GCP risponde?
  ├─ Sì → restituisce DataprocBatchStatus
  └─ No → @Fallback restituisce STATE_UNSPECIFIED
              │
              Lo scheduler ignora STATE_UNSPECIFIED
              e riprova al prossimo tick (30s)
```

---

## 6. Frontend — pagine e funzioni

### 6.1 Dashboard (`/`)

Panoramica generale con:
- 4 KPI: totale processi, in esecuzione, completati, success rate.
- Grafico a torta distribuzione stati.
- 5 link di accesso rapido a tutte le sezioni.
- Diagramma SVG interattivo della state machine.
- Tabella ultimi processi (clic → Inquiry Processi).

### 6.2 Inquiry Processi (`/processi`)

Monitoraggio in tempo reale con:
- **5 stat-card cliccabili** per filtro rapido per stato.
- **Auto-refresh** ogni 30s (toggle).
- **Selezione multipla + resubmit bulk** dei job FAILED.
- **Export CSV** della lista filtrata.
- **Drill-down** per ogni riga: tutti i dettagli + timeline storico transizioni.
- **JumpBar** con azioni: resubmit, nuova elaborazione, statistiche.

### 6.3 Gestione Job (`/gestione-job`) ← NUOVO

Censimento e configurazione dei job Spark. Wizard a 4 tab:

**Tab 1 — Trigger:**
- Nome, descrizione, tipo (SCHEDULED / FILE_DRIVEN).
- Per SCHEDULED: preset orari + cron expression con traduzione in italiano.
- Per FILE_DRIVEN: bucket URI di input + file pattern glob.

**Tab 2 — Output:**
- Modalità: `BUCKET_WRITE`, `DATABASE_UPDATE`, `BUCKET_AND_DATABASE`.
- Bucket URI di output (se scrive su GCS/S3).
- Tipo DB, tabella target, write mode (se aggiorna un database).

**Tab 3 — Dataproc:**
- GCP Project ID e Region.
- URI dello script PySpark.
- Argomenti Spark con placeholder `{date}`, `{inputFile}`, ecc.
- Versione Spark, memoria ed executor core.

**Tab 4 — Avanzate:**
- Abilitazione/disabilitazione del trigger.
- Concorrenza massima, timeout, retry automatici.
- Email di alert e webhook Slack/Teams.

### 6.4 Nuova Elaborazione (`/nuova-elaborazione`)

Avvio manuale di un'elaborazione in due modalità:
- **Singola**: form con selezione opzionale di una JobDefinition/BucketConfig.
- **Bulk**: import CSV incollato, con preview e validazione in tempo reale.

### 6.5 Config Bucket (`/bucket-configs`)

Gestione delle configurazioni di bucket GCS/S3 con:
- Drawer edit/create, eliminazione con conferma.
- Pulsante ▶ per avvio immediato elaborazione da quella config.

### 6.6 Statistiche (`/statistiche`)

Analisi delle esecuzioni:
- KPI strip (5 valori).
- Pie distribuzione stati + success rate.
- Bar chart elaborazioni per bucket.
- Line chart trend ultime 24h (completati vs falliti vs avviati).
- Durata media dei job completati.
- Tabella ultimi 10 errori.

### 6.7 Trigger & Scheduler (`/simulatore`)

- Stato scheduler con pulsante pause/resume.
- Trigger manuale (form).
- Diagramma state machine con documentazione trigger.

---

## 7. Guida passo-passo: configurare un job SCHEDULED

### Scenario

Vogliamo un job che ogni giorno alle **02:00** esegua un report delle vendite
e scriva il risultato come file Parquet su Google Cloud Storage.

### Step 1 — Preparare lo script PySpark

Carica il tuo script su un bucket GCS accessibile a Dataproc:

```bash
gsutil cp report_vendite.py gs://my-scripts-bucket/jobs/report_vendite.py
```

Lo script deve accettare gli argomenti configurati. Esempio minimale:

```python
# report_vendite.py
import sys
from pyspark.sql import SparkSession
from datetime import datetime

def main():
    args = dict(a.split('=') for a in sys.argv[1:] if '=' in a)
    output = args.get('--output', 'gs://default-output/')
    date   = args.get('--date',   datetime.now().strftime('%Y%m%d'))

    spark = SparkSession.builder.appName('report-vendite').getOrCreate()

    # Leggi i dati sorgente
    df = spark.read.format('bigquery').load('my_dataset.vendite')

    # Filtra per la data corrente
    df_today = df.filter(df.data == date)

    # Scrivi l'output su GCS
    df_today.coalesce(1) \
        .write.mode('overwrite') \
        .parquet(f'{output}/{date}/')

    print(f"Scritti {df_today.count()} record in {output}/{date}/")
    spark.stop()

if __name__ == '__main__':
    main()
```

### Step 2 — Creare la JobDefinition dal frontend

1. Apri il menu **Gestione Job** nella sidebar.
2. Clicca **➕ Nuovo Job**.
3. Compila il **Tab 1 — Trigger**:
   - **Nome**: `report-vendite-giornaliero`
   - **Tipo**: `⏰ Schedulato (cron)`
   - **Orario predefinito**: seleziona *"Ogni giorno alle 02:00"*
     → viene compilata automaticamente la cron `0 0 2 * * ?`
   - **Categoria**: `reporting`
   - **Owner**: `team-analytics`
4. Compila il **Tab 2 — Output**:
   - **Modalità**: `🪣 Scrive file su Bucket`
   - **Output Bucket URI**: `gs://my-output-bucket/reports/vendite/`
5. Compila il **Tab 3 — Dataproc**:
   - **GCP Project**: `my-gcp-project`
   - **GCP Region**: `europe-west1`
   - **Script PySpark**: `gs://my-scripts-bucket/jobs/report_vendite.py`
   - **Argomenti** (uno per riga):
     ```
     --output={outputBucketUri}
     --date={date}
     ```
   - **Memoria**: `4g` | **Core**: `2`
6. Compila il **Tab 4 — Avanzate**:
   - **Abilitato**: ✅
   - **Max concorrenti**: `1`
   - **Timeout**: `60` minuti
   - **Max Retry**: `2`
   - **Email alert**: `ops@company.com`
7. Clicca **💾 Salva Job**.

### Step 3 — In alternativa, via API REST

```bash
curl -X POST http://localhost:8080/api/job-definitions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name":            "report-vendite-giornaliero",
    "description":     "Report aggregato vendite. Output Parquet su GCS.",
    "jobType":         "SCHEDULED",
    "category":        "reporting",
    "cronExpression":  "0 0 2 * * ?",
    "outputMode":      "BUCKET_WRITE",
    "outputBucketUri": "gs://my-output-bucket/reports/vendite/",
    "gcpProjectId":    "my-gcp-project",
    "gcpRegion":       "europe-west1",
    "sparkMainScript": "gs://my-scripts-bucket/jobs/report_vendite.py",
    "sparkArguments":  ["--output={outputBucketUri}", "--date={date}"],
    "sparkVersion":    "3.5",
    "executorMemory":  "4g",
    "executorCores":   2,
    "enabled":         true,
    "maxConcurrentRuns": 1,
    "timeoutMinutes":  60,
    "maxRetries":      2,
    "owner":           "team-analytics",
    "alertEmails":     ["ops@company.com"]
  }'
```

### Step 4 — Verificare il funzionamento

Alle 02:00 il sistema attiverà automaticamente il job.
Puoi verificare che sia partito dall'**Inquiry Processi**:
- Cerca il processo con `fileName` = `report-vendite-giornaliero_YYYYMMDD`.
- Lo stato passerà da `SCHEDULED_PENDING` → `SPARK_SUBMITTED` → `COMPLETED`.

Per testare immediatamente senza aspettare le 02:00:

```bash
# Avvio manuale immediato via API
curl -X POST http://localhost:8080/api/job-definitions/<id>/run-now \
  -H "Authorization: Bearer <token>"

# Oppure dal frontend:
# Inquiry Job → riga del job → pulsante ▶ "Avvia ora"
```

---

## 8. Guida passo-passo: configurare un job FILE_DRIVEN

### Scenario A — Aggiornamento database all'arrivo di file CSV

Vogliamo che ogni volta che arriva un file `clienti_*.csv` nel bucket
`gs://input-bucket/clienti/`, venga eseguito un job che carica i dati
nel database PostgreSQL con una logica di UPSERT.

### Step 1 — Script PySpark con scrittura su DB

```python
# load_clienti.py
import sys
from pyspark.sql import SparkSession

def main():
    args = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
    input_file = args.get('--input',     '')
    db_target  = args.get('--db-target', 'public.clienti')

    spark = SparkSession.builder \
        .appName('load-clienti') \
        .config('spark.jars', 'gs://jars/postgresql-42.7.0.jar') \
        .getOrCreate()

    # Leggi il CSV dal bucket GCS
    df = spark.read.csv(input_file, header=True, inferSchema=True)

    # Scrivi su PostgreSQL (UPSERT tramite driver JDBC)
    df.write \
        .format('jdbc') \
        .option('url',      'jdbc:postgresql://my-db-host:5432/mydb') \
        .option('dbtable',  db_target) \
        .option('user',     'spark_user') \
        .option('password', 'secret') \
        .mode('overwrite') \
        .save()

    print(f"Caricati {df.count()} clienti in {db_target}")
    spark.stop()

if __name__ == '__main__':
    main()
```

### Step 2 — Creare la JobDefinition

**Tab 1 — Trigger:**
- **Nome**: `aggiornamento-anagrafica-clienti`
- **Tipo**: `📥 File-Driven (bucket)`
- **Input Bucket URI**: `gs://input-bucket/clienti/`
- **File Pattern**: `clienti_*.csv`

**Tab 2 — Output:**
- **Modalità**: `🗄 Aggiorna Database`
- **Tipo Database**: `PostgreSQL`
- **Write Mode**: `UPSERT`
- **Tabella Target**: `public.clienti`

**Tab 3 — Dataproc:**
- **Script**: `gs://my-scripts-bucket/jobs/load_clienti.py`
- **Argomenti**:
  ```
  --input={inputFile}
  --db-target={outputDbTarget}
  ```

### Step 3 — Configurare il trigger GCS

Configura GCS Eventarc per notificare il tuo endpoint quando arriva un file:

```bash
# Crea trigger Eventarc per notifiche GCS
gcloud eventarc triggers create sbm-trigger-clienti \
  --location=europe-west1 \
  --destination-run-service=spark-batch-monitor \
  --destination-run-region=europe-west1 \
  --destination-run-path=/api/batch-trigger \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=input-bucket" \
  --service-account=sbm-sa@my-project.iam.gserviceaccount.com
```

Il payload che Eventarc invierà al tuo endpoint sarà convertito da Quarkus
nel formato atteso da `POST /api/batch-trigger`:

```json
{
  "bucketUri": "gs://input-bucket/clienti/",
  "fileName":  "clienti_20260601_001.csv",
  "fileSizeBytes": 204800
}
```

### Scenario B — ETL con output su Bucket E aggiornamento BigQuery

**Tab 2 — Output:**
- **Modalità**: `🪣🗄 Scrive su Bucket E aggiorna Database`
- **Output Bucket**: `gs://output-bucket/transazioni-elaborati/`
- **Tipo Database**: `BigQuery`
- **Write Mode**: `APPEND`
- **Tabella Target**: `analytics.movimenti`

**Argomenti Spark:**
```
--input={inputFile}
--output={outputBucketUri}
--bq-table={outputDbTarget}
```

**Script PySpark (frammento):**
```python
# Leggi il file Parquet
df = spark.read.parquet(input_file)

# Trasformazioni ETL
df_clean = df.filter(df.importo > 0) \
             .withColumn('data_elaborazione', current_date())

# Output 1: scrivi su GCS
df_clean.write.mode('append').parquet(output_path)

# Output 2: aggiorna BigQuery
df_clean.write \
    .format('bigquery') \
    .option('table', bq_table) \
    .mode('append') \
    .save()
```

---

## 9. Variabili di configurazione

Il file di configurazione principale è:
`services/batch-service/src/main/resources/application.properties`

Tutte le variabili possono essere sovrascritte via **variabili d'ambiente**
o nel file `.env` nella root del progetto.

### MongoDB

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017` | URI di connessione MongoDB |
| `MONGO_DB` | `spark_monitor` | Nome del database |

### GCP

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `GCP_PROJECT_ID` | `my-gcp-project` | Progetto GCP di default |
| `GCP_REGION` | `europe-west1` | Regione Dataproc di default |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Path al Service Account key JSON (dev locale) |

### SparkMonitoringScheduler

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `SPARK_MONITORING_ENABLED` | `true` | Abilita/disabilita il polling |
| `SPARK_MONITORING_CRON` | `0/30 * * * * ?` | Frequenza polling (ogni 30s) |
| `SPARK_MONITORING_TIMEOUT_MINUTES` | `120` | Timeout globale in minuti |
| `SPARK_MONITORING_MAX_PARALLEL` | `10` | Max chiamate GCP parallele |
| `SPARK_MONITORING_FETCH_BATCH` | `50` | Max job letti da MongoDB per tick |

### ScheduledJobLauncher

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `spark.scheduled-launcher.enabled` | `true` | Abilita il launcher |
| `spark.scheduled-launcher.cron` | `0 * * * * ?` | Frequenza di valutazione cron (ogni minuto) |

### Timeout per tipo di job (configurabili nella JobDefinition)

| Caso d'uso | `timeoutMinutes` consigliato |
|------------|------------------------------|
| Report leggeri (< 30 min) | `45` |
| ETL standard | `120` (default) |
| Job batch pesanti (ore) | `480` |
| Job giornalieri lunghi | `720` |

---

## 10. API Reference

### JobDefinition

```
GET    /api/job-definitions              lista tutte le definizioni
GET    /api/job-definitions/{id}         singola definizione
POST   /api/job-definitions              crea nuova                [admin]
PUT    /api/job-definitions/{id}         modifica                  [admin]
DELETE /api/job-definitions/{id}         elimina                   [admin]
GET    /api/job-definitions/search?q=    ricerca full-text
GET    /api/job-definitions/by-type/{SCHEDULED|FILE_DRIVEN}
POST   /api/job-definitions/{id}/run-now avvio manuale immediato   [admin]
```

### BatchProcess

```
GET    /api/batch-processes                     lista esecuzioni
GET    /api/batch-processes/{id}                singola esecuzione
POST   /api/batch-processes                     crea manualmente
PUT    /api/batch-processes/{id}                modifica
DELETE /api/batch-processes/{id}                elimina
GET    /api/batch-processes/search?q=           ricerca
GET    /api/batch-processes/stats               statistiche aggregate
GET    /api/batch-processes/state-machine       definizione JSON stati
POST   /api/batch-processes/{id}/submit         transizione manuale → SPARK_SUBMITTED
GET    /api/batch-processes/scheduler/status    stato scheduler      [admin]
POST   /api/batch-processes/scheduler/pause     metti in pausa       [admin]
POST   /api/batch-processes/scheduler/resume    riprendi             [admin]
```

### Trigger

```
POST   /api/batch-trigger                  avvia flusso da file bucket
POST   /api/batch-trigger/{id}/resubmit   resubmit job FAILED
```

### Auth

```
POST   /api/auth/login    → { token, user }
POST   /api/auth/logout
```

---

## 11. FAQ e troubleshooting

### Il job SCHEDULED non parte all'orario configurato

1. Verifica che `spark.scheduled-launcher.enabled=true`.
2. Controlla che la `JobDefinition` abbia `enabled: true`.
3. Controlla la cron expression con il tool online [crontab.guru](https://crontab.guru/)
   (adattando al formato a 6 campi aggiungendo `0` in testa).
4. Controlla i log del backend:
   ```bash
   docker compose logs batch-service | grep ScheduledJobLauncher
   ```

### Il job FILE_DRIVEN non parte all'arrivo del file

1. Verifica che il trigger GCS Eventarc sia configurato correttamente.
2. Testa manualmente chiamando `POST /api/batch-trigger`:
   ```bash
   curl -X POST http://localhost:8080/api/batch-trigger \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"bucketUri":"gs://input-bucket/clienti/","fileName":"clienti_test.csv"}'
   ```
3. Se funziona il test manuale ma non il trigger automatico, il problema
   è nella configurazione Eventarc (permessi IAM, filtri evento).

### Il job rimane bloccato in SPARK_SUBMITTED

1. Verifica che `SPARK_MONITORING_ENABLED=true`.
2. Verifica la connettività GCP dal container:
   ```bash
   docker compose exec batch-service \
     wget -qO- https://dataproc.googleapis.com/ || echo "GCP non raggiungibile"
   ```
3. Controlla le credenziali GCP:
   ```bash
   docker compose exec batch-service env | grep GOOGLE
   ```
4. Se il job è davvero bloccato, il circuit-breaker di timeout lo forzerà
   a FAILED dopo `SPARK_MONITORING_TIMEOUT_MINUTES` (default: 120 min).

### Come vedere i log di un'esecuzione Dataproc

```bash
# Tramite gcloud CLI
gcloud dataproc batches describe <batchId> \
  --project=my-gcp-project \
  --region=europe-west1

# Oppure: consulta il campo batchResourceName nel BatchProcess
# e cercalo nella console GCP → Dataproc → Serverless Batches
```

### Come forzare manualmente una transizione di stato

```bash
# Forza SPARK_SUBMITTED su un processo FILE_RECEIVED
curl -X POST http://localhost:8080/api/batch-processes/<id>/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"batchResourceName":"projects/my-proj/locations/europe-west1/batches/my-batch"}'

# Resubmit di un processo FAILED
curl -X POST http://localhost:8080/api/batch-trigger/<id>/resubmit \
  -H "Authorization: Bearer <token>"
```

### Come aggiungere un nuovo stato alla state machine

Vedi il documento separato `GUIDA-STATE-MACHINE.md`.

---

*Documento generato per spark-batch-monitor v2.0 — com.example.sbm*
*Ultimo aggiornamento: Giugno 2026*
