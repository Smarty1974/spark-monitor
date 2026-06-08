# Spark Batch Monitor

Sistema di monitoraggio job Apache Spark su **GCP Dataproc Serverless** con macchina a stati MongoDB, backend Quarkus 3.8.1 e frontend React-Admin + componenti IsycorePV.

---

## Architettura

```
GCS/S3 Bucket
    │ Eventarc / SNS / Manuale
    ▼
POST /api/batch-trigger
    │  crea BatchProcess (FILE_RECEIVED)
    │  submette batch a GCP Dataproc Serverless
    │  aggiorna stato → SPARK_SUBMITTED
    ▼
MongoDB spark_monitor
    ▲
    │  ogni 30 s
SparkMonitoringScheduler
    │  polling GCP con proiezione minima
    │  Retry 3x + Timeout 10s + Fallback
    │  circuit-breaker timeout 2h
    ▼
COMPLETED / FAILED
```

### Macchina a stati

```
FILE_RECEIVED ──► SPARK_SUBMITTED ──► COMPLETED  (GCP: SUCCEEDED)
                       │
                       ├──► FAILED               (GCP: FAILED/CANCELLED/CANCELLING)
                       └──► FAILED               (timeout 2h — circuit-breaker)

FAILED ──► FILE_RECEIVED  (resubmit manuale)
```

---

## Quickstart — docker compose up --build

### 1. Setup GCP Service Account (sviluppo locale)

```bash
# Crea SA e scarica chiave
gcloud iam service-accounts create sbm-sa
gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:sbm-sa@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/dataproc.editor"
gcloud iam service-accounts keys create ./gcp-sa-key.json \
  --iam-account sbm-sa@YOUR_PROJECT.iam.gserviceaccount.com
```

### 2. File .env

```env
GCP_PROJECT_ID=my-gcp-project
GCP_REGION=europe-west1
GCP_SA_KEY_PATH=./gcp-sa-key.json
```

### 3. Avvio

```bash
docker compose up --build
# oppure in background:
docker compose up --build -d && docker compose logs -f batch-service
```

### 4. Accesso

| Servizio   | URL                                        |
|------------|--------------------------------------------|
| Frontend   | http://localhost:3000  (admin / admin123)  |
| Swagger UI | http://localhost:8080/api/swagger-ui       |
| Health     | http://localhost:8080/q/health             |

---

## API Reference

### BatchProcess `/api/batch-processes`

```
GET    /                     lista paginata (X-Total-Count)
GET    /{id}                 singolo processo
POST   /                     crea (FILE_RECEIVED)
PUT    /{id}                 aggiorna
DELETE /{id}                 elimina
GET    /search?q=            ricerca full-text
GET    /stats                statistiche aggregate (dashboard)
GET    /state-machine        definizione JSON state machine
POST   /{id}/submit          FILE_RECEIVED → SPARK_SUBMITTED
GET    /scheduler/status     stato scheduler  [admin]
POST   /scheduler/pause      pausa scheduler  [admin]
POST   /scheduler/resume     riprende scheduler [admin]
```

### BucketConfig `/api/bucket-configs`

```
GET    /           lista
GET    /{id}       singola
POST   /           crea
PUT    /{id}       modifica
DELETE /{id}       elimina
GET    /search?q=  ricerca
GET    /active     solo trigger abilitati
```

### Trigger `/api/batch-trigger`

```
POST /                    avvia flusso da file bucket
POST /{id}/resubmit       resubmit da FAILED
```

### Auth `/api/auth`

```
POST /login   → { token, user }
POST /logout
```

---

## SparkMonitoringScheduler

### Algoritmo tick (ogni 30s)

```
1. MongoDB: findSubmittedForPolling(50)
   Proiezione minima: { _id, batchResourceName, fileName, updatedAt }
   Hint indice: { state:1, updatedAt:1 }  ← CRITICO per performance

2. Separa job scaduti (age >= 120 min) da job da controllare

3. Job scaduti → transitionToFailed("Timeout Superato") + alert
   (nessuna chiamata GCP)

4. Job attivi → polling GCP in parallelo (max 10 thread)
   - DataprocClient.getBatchStatus(batchResourceName)
   - @Retry(3, 1s, jitter 200ms) + @Timeout(10s) + @Fallback
   - Fallback → STATE_UNSPECIFIED → skip (riprova al tick successivo)

5. Switch stato GCP:
   SUCCEEDED  → transitionToCompleted() + notification
   FAILED/CANCELLED/CANCELLING → transitionToFailed(errMsg) + alert
   PENDING/RUNNING → skip (in corso)

6. Fault isolation: ogni job in try-catch indipendente
   concurrentExecution=SKIP: skip se tick precedente ancora running
```

### Update atomici MongoDB

Le transizioni usano `updateOne` con filtro `{ _id, state_atteso }`:
- Idempotenti: se il documento è già nello stato target, modified=0 (ok)
- Anti-race-condition: più istanze dello scheduler non si sovrappongono

---

## Frontend

| Pagina            | Tipo        | Conformità skill       |
|-------------------|-------------|------------------------|
| Dashboard         | dashboard   | React-Admin custom     |
| Inquiry Processi  | inquiry     | AdvancedSearch + PartitaTable + renderDetail + jumpBar |
| Bucket Config     | master-data | AdvancedSearch + PartitaTable + Drawer |
| Simulatore        | utility     | Form + tab navigation  |

Mock data integrato in `pvClient.ts` — il frontend funziona anche senza backend.

---

## Deploy Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/mongodb/mongodb.yaml
kubectl rollout status deployment/mongodb -n spark-batch-monitor
kubectl apply -f k8s/batch-service/deployment.yaml
kubectl rollout status deployment/batch-service -n spark-batch-monitor
kubectl apply -f k8s/ingress.yaml
kubectl get all -n spark-batch-monitor
```

In produzione su GKE: usare **Workload Identity Federation** invece delle SA key files.
