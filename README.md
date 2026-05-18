# Spark Monitor

Dashboard di monitoraggio batch Apache Spark — generata con quarkus-generator.

## Stack tecnologico

| Layer      | Tecnologia                              |
|------------|------------------------------------------|
| Backend    | Quarkus 3.8.1, Java 21, REST + JDBC     |
| Database   | PostgreSQL 16                            |
| Migrations | Flyway                                   |
| Frontend   | React-Admin 5, Vite, Material UI         |
| Deploy     | Docker Compose (dev), Kubernetes (prod)  |

---

## Struttura del progetto

```
spark-monitor/
├── services/
│   └── monitor-service/          ← Quarkus REST API (porta 8081)
│       ├── src/main/java/.../
│       │   ├── entity/           5 entità
│       │   ├── dto/              5 DTO con validazione
│       │   ├── repository/       5 repository JDBC
│       │   ├── service/          5 service
│       │   └── resource/         5 resource JAX-RS
│       └── src/main/resources/
│           └── db/migration/     V1..V5 migrazioni Flyway
├── frontend/                     ← React-Admin SPA (porta 3000)
│   └── src/resources/            5 componenti (List/Show/Create/Edit)
├── k8s/                          ← Manifest Kubernetes
└── docker-compose.yml
```

---

## Entità

| Entità               | Tabella                | Note                              |
|----------------------|------------------------|-----------------------------------|
| SparkJob             | spark_jobs             | Soft delete, auditing             |
| SparkJobExecution    | spark_job_executions   | FK → SparkJob, auditing           |
| SparkMetric          | spark_metrics          | FK → SparkJobExecution, auditing  |
| SparkSchedule        | spark_schedules        | Soft delete, FK → SparkJob        |
| SparkAlert           | spark_alerts           | FK → SparkJob (nullable)          |

---

## Avvio locale con Docker Compose

### Prerequisiti
- Docker >= 24
- Docker Compose >= 2.20

### Comandi

```bash
# Clona / entra nella directory
cd spark-monitor

# Build e avvio completo
docker-compose up --build

# Solo il database (per sviluppo)
docker-compose up postgres

# Stop
docker-compose down

# Stop + elimina volumi
docker-compose down -v
```

### URL locali

| Servizio        | URL                                        |
|-----------------|--------------------------------------------|
| Frontend        | http://localhost:3000                      |
| API             | http://localhost:8081/api                  |
| Swagger UI      | http://localhost:8081/q/swagger-ui         |
| Health          | http://localhost:8081/q/health             |
| OpenAPI spec    | http://localhost:8081/q/openapi            |

---

## Sviluppo backend (senza Docker)

```bash
cd services/monitor-service

# Avvia il database
docker-compose up postgres -d

# Dev mode con hot-reload
./mvnw quarkus:dev

# Build produzione
./mvnw package -DskipTests
```

---

## Sviluppo frontend

```bash
cd frontend

# Installa dipendenze
npm install

# Dev mode (proxy verso localhost:8081)
npm run dev

# Build produzione
npm run build
```

---

## API REST — monitor-service

Base URL: `http://localhost:8081/api`

### SparkJobs `/spark-jobs`
| Metodo | Path                  | Descrizione                      |
|--------|-----------------------|----------------------------------|
| GET    | /spark-jobs           | Lista paginata (page, size, sort)|
| GET    | /spark-jobs/{id}      | Dettaglio job                    |
| POST   | /spark-jobs           | Crea nuovo job                   |
| PUT    | /spark-jobs/{id}      | Aggiorna job                     |
| DELETE | /spark-jobs/{id}      | Soft delete job                  |
| GET    | /spark-jobs/search?q= | Ricerca per nome                 |

### SparkJobExecutions `/spark-job-executions`
| Metodo | Path                              | Descrizione          |
|--------|-----------------------------------|----------------------|
| GET    | /spark-job-executions             | Lista paginata       |
| GET    | /spark-job-executions?sparkJobId= | Filtra per job       |
| POST   | /spark-job-executions             | Registra esecuzione  |
| PUT    | /spark-job-executions/{id}        | Aggiorna esecuzione  |
| DELETE | /spark-job-executions/{id}        | Elimina esecuzione   |

### SparkMetrics `/spark-metrics`
| Metodo | Path                          | Descrizione        |
|--------|-------------------------------|--------------------|
| GET    | /spark-metrics                | Lista paginata     |
| GET    | /spark-metrics?executionId=   | Filtra per exec    |
| POST   | /spark-metrics                | Inserisci metrica  |
| PUT    | /spark-metrics/{id}           | Aggiorna metrica   |
| DELETE | /spark-metrics/{id}           | Elimina metrica    |

### SparkSchedules `/spark-schedules`
| Metodo | Path                     | Descrizione           |
|--------|--------------------------|-----------------------|
| GET    | /spark-schedules         | Lista paginata        |
| POST   | /spark-schedules         | Crea schedulazione    |
| PUT    | /spark-schedules/{id}    | Aggiorna schedule     |
| DELETE | /spark-schedules/{id}    | Soft delete schedule  |
| GET    | /spark-schedules/search  | Cerca per nome        |

### SparkAlerts `/spark-alerts`
| Metodo | Path                  | Descrizione      |
|--------|-----------------------|------------------|
| GET    | /spark-alerts         | Lista alert      |
| POST   | /spark-alerts         | Crea alert       |
| PUT    | /spark-alerts/{id}    | Aggiorna alert   |
| DELETE | /spark-alerts/{id}    | Elimina alert    |

---

## Deploy su Kubernetes

```bash
# Crea namespace
kubectl apply -f k8s/namespace.yaml

# Database
kubectl apply -f k8s/postgresql.yaml

# Secrets (MODIFICA LE PASSWORD prima!)
kubectl apply -f k8s/monitor-service/secret.yaml

# ConfigMap
kubectl apply -f k8s/monitor-service/configmap.yaml

# Servizi applicativi
kubectl apply -f k8s/monitor-service/deployment.yaml
kubectl apply -f k8s/monitor-service/service.yaml
kubectl apply -f k8s/frontend.yaml

# Ingress
kubectl apply -f k8s/ingress.yaml

# Verifica
kubectl get pods -n spark-monitor
kubectl get svc  -n spark-monitor
```

### Cambio password in produzione

```bash
# Genera base64 della nuova password
echo -n "nuovaPassword_sicura!" | base64

# Modifica k8s/monitor-service/secret.yaml con il nuovo valore
# Poi applica
kubectl apply -f k8s/monitor-service/secret.yaml
kubectl rollout restart deployment/monitor-service -n spark-monitor
```

---

## Generato con

**quarkus-generator skill** — Claude Sonnet 4.6
