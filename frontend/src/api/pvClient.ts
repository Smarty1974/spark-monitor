const BASE = '/api'

function authHeader(): Record<string, string> {
  const t = localStorage.getItem('auth_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function http<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(opts?.headers as Record<string, string> ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

// ── Tipi ─────────────────────────────────────────────────────────────────────

export type JobType   = 'SCHEDULED' | 'FILE_DRIVEN'
export type OutputMode= 'BUCKET_WRITE' | 'DATABASE_UPDATE' | 'BUCKET_AND_DATABASE'
export type BatchState= 'FILE_RECEIVED' | 'SCHEDULED_PENDING' | 'SPARK_SUBMITTED' | 'COMPLETED' | 'FAILED'

export interface JobDefinition {
  id?: string
  name: string
  description?: string
  jobType: JobType
  category?: string
  // Trigger
  cronExpression?: string
  inputBucketUri?: string
  filePattern?: string
  // Output
  outputMode?: OutputMode
  outputBucketUri?: string
  outputDbType?: string
  outputDbTarget?: string
  outputWriteMode?: string
  // GCP Dataproc
  gcpProjectId?: string
  gcpRegion?: string
  dataprocBatchTemplate?: string
  sparkMainScript?: string
  sparkArguments?: string[]
  sparkVersion?: string
  executorMemory?: string
  executorCores?: number
  // Comportamento
  enabled?: boolean
  maxConcurrentRuns?: number
  timeoutMinutes?: number
  maxRetries?: number
  retryDelayMinutes?: number
  // Notifiche
  alertEmails?: string[]
  webhookUrl?: string
  // Metadati
  tags?: string[]
  owner?: string
  createdAt?: string
  updatedAt?: string
}

export interface BatchProcess {
  id: string
  jobType?: JobType
  jobDefinitionId?: string
  fileName?: string
  bucketUri?: string
  fileSizeBytes?: number
  outputMode?: OutputMode
  outputBucketUri?: string
  outputPath?: string
  outputDbTarget?: string
  outputRecordCount?: number
  batchResourceName?: string
  sparkJobId?: string
  scheduledAt?: string
  startedAt?: string
  finishedAt?: string
  state: string
  errorMessage?: string
  retryCount?: number
  history?: HistoryEntry[]
  bucketConfigId?: string
  metadataJson?: string
  createdAt?: string
  updatedAt?: string
}

export interface HistoryEntry {
  timestamp?: string
  fromState?: string
  toState: string
  message?: string
}

export interface BucketConfig {
  id: string
  name: string
  bucketUri: string
  storageType: string
  dataprocBatchTemplate?: string
  gcpProjectId?: string
  gcpRegion?: string
  filePattern?: string
  triggerEnabled: boolean
  maxConcurrentJobs: number
  description?: string
  createdAt?: string
  updatedAt?: string
}

export interface BatchStats {
  total: number
  fileReceived: number
  sparkSubmitted: number
  completed: number
  failed: number
  successRate: number
}

export interface TriggerRequest {
  bucketUri: string
  fileName: string
  bucketConfigId?: string
  metadataJson?: string
  fileSizeBytes?: number
}

// ── JobDefinition API ─────────────────────────────────────────────────────────

export const getJobDefinitions = (): Promise<JobDefinition[]> =>
  http<JobDefinition[]>(`${BASE}/job-definitions?page=0&size=200`).catch(() => MOCK_JOB_DEFS)

export const getJobDefinition = (id: string): Promise<JobDefinition> =>
  http<JobDefinition>(`${BASE}/job-definitions/${id}`)

export const createJobDefinition = (d: JobDefinition): Promise<JobDefinition> =>
  http<JobDefinition>(`${BASE}/job-definitions`, { method: 'POST', body: JSON.stringify(d) })

export const updateJobDefinition = (id: string, d: JobDefinition): Promise<JobDefinition> =>
  http<JobDefinition>(`${BASE}/job-definitions/${id}`, { method: 'PUT', body: JSON.stringify(d) })

export const deleteJobDefinition = (id: string): Promise<void> =>
  http<void>(`${BASE}/job-definitions/${id}`, { method: 'DELETE' })

export const runJobNow = (id: string): Promise<unknown> =>
  http<unknown>(`${BASE}/job-definitions/${id}/run-now`, { method: 'POST' })

// ── BatchProcess API ──────────────────────────────────────────────────────────

export const getBatchProcesses = (page = 0, size = 200): Promise<BatchProcess[]> =>
  http<BatchProcess[]>(`${BASE}/batch-processes?page=${page}&size=${size}&sort=createdAt&order=desc`)
    .catch(() => MOCK_PROCESSES)

export const getBatchStats = (): Promise<BatchStats> =>
  http<BatchStats>(`${BASE}/batch-processes/stats`).catch((): BatchStats => ({
    total: 6, fileReceived: 1, sparkSubmitted: 2, completed: 2, failed: 1, successRate: 66.6,
  }))

export const resubmitProcess = (id: string): Promise<unknown> =>
  http<unknown>(`${BASE}/batch-trigger/${id}/resubmit`, { method: 'POST' })

// ── BucketConfig API ──────────────────────────────────────────────────────────

export const getBucketConfigs = (): Promise<BucketConfig[]> =>
  http<BucketConfig[]>(`${BASE}/bucket-configs?page=0&size=100`).catch(() => MOCK_BUCKETS)

export const createBucketConfig = (d: Partial<BucketConfig>): Promise<BucketConfig> =>
  http<BucketConfig>(`${BASE}/bucket-configs`, { method: 'POST', body: JSON.stringify(d) })

export const updateBucketConfig = (id: string, d: Partial<BucketConfig>): Promise<BucketConfig> =>
  http<BucketConfig>(`${BASE}/bucket-configs/${id}`, { method: 'PUT', body: JSON.stringify(d) })

export const deleteBucketConfig = (id: string): Promise<void> =>
  http<void>(`${BASE}/bucket-configs/${id}`, { method: 'DELETE' })

// ── Trigger API ───────────────────────────────────────────────────────────────

export const triggerBatchFlow = (req: TriggerRequest): Promise<unknown> =>
  http<unknown>(`${BASE}/batch-trigger`, { method: 'POST', body: JSON.stringify(req) })

// ── Scheduler API ─────────────────────────────────────────────────────────────

export const getSchedulerStatus = (): Promise<Record<string, unknown>> =>
  http<Record<string, unknown>>(`${BASE}/batch-processes/scheduler/status`).catch(() => ({
    running: true, jobIdentity: 'SparkMonitoringScheduler#pollSparkJobs',
  }))

export const pauseScheduler  = (): Promise<unknown> =>
  http<unknown>(`${BASE}/batch-processes/scheduler/pause`,  { method: 'POST' })

export const resumeScheduler = (): Promise<unknown> =>
  http<unknown>(`${BASE}/batch-processes/scheduler/resume`, { method: 'POST' })

// ── Export CSV ────────────────────────────────────────────────────────────────

export function exportCsv(rows: BatchProcess[], filename = 'processi.csv') {
  const headers = ['id','jobType','fileName','bucketUri','state','sparkJobId',
                   'outputMode','outputBucketUri','scheduledAt','createdAt','updatedAt','errorMessage']
  const lines = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => {
      const v = (r as unknown as Record<string, unknown>)[h] ?? ''
      return `"${String(v).replace(/"/g, '""')}"`
    }).join(';')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Mock data ─────────────────────────────────────────────────────────────────

export const MOCK_JOB_DEFS: JobDefinition[] = [
  {
    id: 'jd001', name: 'report-vendite-giornaliero', jobType: 'SCHEDULED',
    description: 'Report aggregato delle vendite giornaliere. Scrive Parquet su GCS.',
    category: 'reporting', cronExpression: '0 0 2 * * ?',
    outputMode: 'BUCKET_WRITE', outputBucketUri: 'gs://output-bucket/reports/vendite/',
    gcpProjectId: 'my-gcp-project', gcpRegion: 'europe-west1',
    sparkMainScript: 'gs://scripts/report_vendite.py',
    sparkArguments: ['--output={outputBucketUri}', '--date={date}'],
    sparkVersion: '3.5', executorMemory: '4g', executorCores: 2,
    enabled: true, maxConcurrentRuns: 1, timeoutMinutes: 60, maxRetries: 2,
    owner: 'team-analytics', tags: ['reporting', 'daily'],
    createdAt: '2026-01-10T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'jd002', name: 'aggiornamento-anagrafica-clienti', jobType: 'FILE_DRIVEN',
    description: 'Elabora file CSV clienti dal bucket e aggiorna il DB PostgreSQL.',
    category: 'anagrafica',
    inputBucketUri: 'gs://input-bucket/clienti/', filePattern: 'clienti_*.csv',
    outputMode: 'DATABASE_UPDATE',
    outputDbType: 'PostgreSQL', outputDbTarget: 'public.clienti', outputWriteMode: 'UPSERT',
    gcpProjectId: 'my-gcp-project', gcpRegion: 'europe-west1',
    sparkMainScript: 'gs://scripts/load_clienti.py',
    sparkArguments: ['--input={inputFile}', '--db-target={outputDbTarget}'],
    sparkVersion: '3.5', executorMemory: '2g', executorCores: 1,
    enabled: true, maxConcurrentRuns: 3, timeoutMinutes: 30, maxRetries: 1,
    owner: 'team-crm', tags: ['anagrafica', 'clienti'],
    createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z',
  },
  {
    id: 'jd003', name: 'etl-transazioni-banca', jobType: 'FILE_DRIVEN',
    description: 'ETL dei file transazioni: scrive dataset Parquet + aggiorna tabella movimenti.',
    category: 'etl',
    inputBucketUri: 'gs://input-bucket/transazioni/', filePattern: 'trans_*.parquet',
    outputMode: 'BUCKET_AND_DATABASE',
    outputBucketUri: 'gs://output-bucket/transazioni-elaborati/',
    outputDbType: 'BigQuery', outputDbTarget: 'analytics.movimenti', outputWriteMode: 'APPEND',
    gcpProjectId: 'my-gcp-project', gcpRegion: 'europe-west1',
    sparkMainScript: 'gs://scripts/etl_transazioni.py',
    sparkArguments: ['--input={inputFile}', '--output={outputBucketUri}', '--bq-table={outputDbTarget}'],
    sparkVersion: '3.5', executorMemory: '8g', executorCores: 4,
    enabled: true, maxConcurrentRuns: 2, timeoutMinutes: 120, maxRetries: 0,
    owner: 'team-finance', tags: ['etl', 'transazioni', 'bigquery'],
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-05-20T00:00:00Z',
  },
]

export const MOCK_PROCESSES: BatchProcess[] = [
  {
    id: 'bp001', jobType: 'SCHEDULED', jobDefinitionId: 'jd001',
    fileName: 'report-vendite-giornaliero_20260601',
    state: 'COMPLETED', outputMode: 'BUCKET_WRITE',
    outputBucketUri: 'gs://output-bucket/reports/vendite/',
    outputPath: 'gs://output-bucket/reports/vendite/20260601/part-00000.parquet',
    outputRecordCount: 48293,
    batchResourceName: 'projects/my-proj/locations/europe-west1/batches/sbm-report-20260601',
    sparkJobId: 'sbm-report-20260601',
    scheduledAt: '2026-06-01T02:00:00Z', startedAt: '2026-06-01T02:00:05Z',
    finishedAt: '2026-06-01T02:18:42Z',
    history: [
      { timestamp: '2026-06-01T02:00:00Z', toState: 'SCHEDULED_PENDING', message: 'Cron 0 0 2 * * ? raggiunto' },
      { timestamp: '2026-06-01T02:00:05Z', fromState: 'SCHEDULED_PENDING', toState: 'SPARK_SUBMITTED', message: 'Sottomesso a Dataproc' },
      { timestamp: '2026-06-01T02:18:42Z', fromState: 'SPARK_SUBMITTED', toState: 'COMPLETED', message: 'GCP: SUCCEEDED — 48.293 record scritti' },
    ],
    createdAt: '2026-06-01T02:00:00Z', updatedAt: '2026-06-01T02:18:42Z',
  },
  {
    id: 'bp002', jobType: 'FILE_DRIVEN', jobDefinitionId: 'jd002',
    fileName: 'clienti_20260601_001.csv', bucketUri: 'gs://input-bucket/clienti/',
    state: 'SPARK_SUBMITTED', outputMode: 'DATABASE_UPDATE',
    outputDbTarget: 'public.clienti',
    batchResourceName: 'projects/my-proj/locations/europe-west1/batches/sbm-clienti-abc123',
    sparkJobId: 'sbm-clienti-abc123', fileSizeBytes: 204800,
    history: [
      { timestamp: '2026-06-01T09:00:00Z', toState: 'FILE_RECEIVED', message: 'File arrivato nel bucket' },
      { timestamp: '2026-06-01T09:00:08Z', fromState: 'FILE_RECEIVED', toState: 'SPARK_SUBMITTED', message: 'Sottomesso a Dataproc' },
    ],
    createdAt: '2026-06-01T09:00:00Z', updatedAt: '2026-06-01T09:00:08Z',
  },
  {
    id: 'bp003', jobType: 'FILE_DRIVEN', jobDefinitionId: 'jd003',
    fileName: 'trans_20260601.parquet', bucketUri: 'gs://input-bucket/transazioni/',
    state: 'COMPLETED', outputMode: 'BUCKET_AND_DATABASE',
    outputBucketUri: 'gs://output-bucket/transazioni-elaborati/',
    outputDbTarget: 'analytics.movimenti', outputRecordCount: 125840,
    sparkJobId: 'sbm-trans-xyz789', fileSizeBytes: 10485760,
    history: [
      { timestamp: '2026-06-01T07:00:00Z', toState: 'FILE_RECEIVED', message: 'File arrivato' },
      { timestamp: '2026-06-01T07:00:10Z', fromState: 'FILE_RECEIVED', toState: 'SPARK_SUBMITTED', message: 'Sottomesso' },
      { timestamp: '2026-06-01T08:12:00Z', fromState: 'SPARK_SUBMITTED', toState: 'COMPLETED', message: 'GCP: SUCCEEDED — 125.840 record' },
    ],
    createdAt: '2026-06-01T07:00:00Z', updatedAt: '2026-06-01T08:12:00Z',
  },
  {
    id: 'bp004', jobType: 'SCHEDULED', jobDefinitionId: 'jd001',
    fileName: 'report-vendite-giornaliero_20260531',
    state: 'FAILED', outputMode: 'BUCKET_WRITE',
    errorMessage: 'Stato GCP: FAILED | SparkException: OutOfMemoryError in stage 4',
    retryCount: 2,
    history: [
      { timestamp: '2026-05-31T02:00:00Z', toState: 'SCHEDULED_PENDING', message: 'Cron raggiunto' },
      { timestamp: '2026-05-31T02:00:06Z', fromState: 'SCHEDULED_PENDING', toState: 'SPARK_SUBMITTED', message: 'Sottomesso' },
      { timestamp: '2026-05-31T02:45:00Z', fromState: 'SPARK_SUBMITTED', toState: 'FAILED', message: 'OOM in stage 4' },
    ],
    createdAt: '2026-05-31T02:00:00Z', updatedAt: '2026-05-31T02:45:00Z',
  },
]

export const MOCK_BUCKETS: BucketConfig[] = [
  {
    id: 'bc001', name: 'Input Clienti GCS', bucketUri: 'gs://input-bucket/clienti/',
    storageType: 'GCS', gcpProjectId: 'my-gcp-project', gcpRegion: 'europe-west1',
    filePattern: 'clienti_*.csv', triggerEnabled: true, maxConcurrentJobs: 3,
    description: 'Bucket per file anagrafiche clienti',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'bc002', name: 'Input Transazioni GCS', bucketUri: 'gs://input-bucket/transazioni/',
    storageType: 'GCS', gcpProjectId: 'my-gcp-project', gcpRegion: 'europe-west1',
    filePattern: 'trans_*.parquet', triggerEnabled: true, maxConcurrentJobs: 2,
    description: 'Bucket per file transazioni finanziarie',
    createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
  },
]
