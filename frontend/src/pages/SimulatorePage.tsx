import React, { useState, useEffect } from 'react'
import { PvBadge, fmtDate } from '../components/DesignSystem'
import { StateMachineDiagram } from '../components/StateMachineDiagram'
import {
  getSchedulerStatus, pauseScheduler, resumeScheduler,
  getBucketConfigs, triggerBatchFlow, type BucketConfig,
} from '../api/pvClient'

export function SimulatorePage() {
  const [tab, setTab]         = useState<'trigger' | 'scheduler' | 'diagram'>('scheduler')
  const [buckets, setBuckets] = useState<BucketConfig[]>([])
  const [form, setForm]       = useState({ bucketUri: '', fileName: '', configId: '' })
  const [result, setResult]   = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [sched, setSched]     = useState<Record<string, unknown> | null>(null)
  const [schedLoading, setSchedLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    getBucketConfigs().then(setBuckets).catch(() => {})
    loadScheduler()
  }, [])

  function loadScheduler() {
    setSchedLoading(true)
    getSchedulerStatus().then(setSched).catch(() => {}).finally(() => setSchedLoading(false))
  }

  async function handleTrigger() {
    if (!form.bucketUri || !form.fileName) { setError('Bucket URI e nome file obbligatori'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await triggerBatchFlow({
        bucketUri: form.bucketUri, fileName: form.fileName,
        bucketConfigId: form.configId || undefined,
      })
      setResult(r)
    } catch (e) { setError('Errore: ' + String(e)) }
    finally { setLoading(false) }
  }

  async function toggleScheduler() {
    if (!sched) return
    setSchedLoading(true)
    try {
      if (sched.running) await pauseScheduler()
      else               await resumeScheduler()
      await loadScheduler()
    } catch (e) { setError('Errore scheduler: ' + String(e)) }
    finally { setSchedLoading(false) }
  }

  const TABS = [
    { id: 'scheduler' as const, label: '⏱ Scheduler' },
    { id: 'trigger'   as const, label: '▶ Trigger Manuale' },
    { id: 'diagram'   as const, label: '📊 State Machine' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚙️ Trigger & Scheduler</h1>
        <p className="page-sub">Controllo dello scheduler di polling e trigger manuali</p>
        <div className="page-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`page-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pvPage">
        {error && <div className="pvError">{error}</div>}

        {/* ── Scheduler ──────────────────────────────────────────────── */}
        {tab === 'scheduler' && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>SparkMonitoringScheduler</h3>
                {sched && (
                  <button
                    className={sched.running ? 'danger-btn' : 'primary'}
                    onClick={toggleScheduler} disabled={schedLoading}
                    style={{ fontSize: 12, padding: '6px 14px' }}>
                    {schedLoading ? '⏳' : sched.running ? '⏸ Metti in pausa' : '▶ Riprendi'}
                  </button>
                )}
              </div>

              {sched ? (
                <div>
                  {[
                    ['Stato',           <PvBadge tone={sched.running ? 'green' : 'gray'}>
                                          {sched.running ? '▶ In esecuzione' : '⏸ In pausa'}
                                        </PvBadge>],
                    ['Job identity',    <code style={{ fontSize: 11 }}>{String(sched.jobIdentity ?? '—')}</code>],
                  ].map(([l, v], i) => (
                    <div key={i} style={{ display: 'flex', gap: 16, padding: '10px 0',
                      borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)', minWidth: 160,
                        textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>{l as string}</span>
                      <span style={{ fontSize: 13 }}>{v as React.ReactElement}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pvHint">Caricamento stato scheduler...</div>
              )}

              <button className="secondary" onClick={loadScheduler} disabled={schedLoading}
                style={{ marginTop: 16, fontSize: 12 }}>
                {schedLoading ? <span className="spin">↻</span> : '↻'} Aggiorna stato
              </button>
            </div>

            <div style={{ marginTop: 20, background: 'var(--color-accent-dim)', border: '1px solid #90caf9',
              borderRadius: 'var(--radius)', padding: 16 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-accent)' }}>
                ℹ️ Logica di monitoraggio (ogni 30s)
              </h4>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--color-accent)', lineHeight: 1.8 }}>
                <li>Carica processi <code>SPARK_SUBMITTED</code> da MongoDB (proiezione minima)</li>
                <li>Job con età &gt; 120 min → <code>FAILED</code> (circuit-breaker timeout)</li>
                <li>Job attivi → polling GCP Dataproc (max 10 paralleli, timeout 25s)</li>
                <li><code>SUCCEEDED</code> → <code>COMPLETED</code> | <code>FAILED/CANCELLED</code> → <code>FAILED</code></li>
                <li>GCP non raggiungibile → fallback silenzioso, riprova al tick successivo</li>
              </ol>
            </div>
          </div>
        )}

        {/* ── Trigger Manuale ─────────────────────────────────────────── */}
        {tab === 'trigger' && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)', padding: 24 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Trigger manuale</h3>
              <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                Avvia il flusso <code>FILE_RECEIVED → SPARK_SUBMITTED</code> senza passare da un bucket.
                Per un form completo usa la pagina <strong>Nuova Elaborazione</strong>.
              </p>

              <div className="form-grid">
                <div className="form-field span2">
                  <label>CONFIGURAZIONE BUCKET (opzionale)</label>
                  <select value={form.configId}
                    onChange={e => {
                      const bc = buckets.find(b => b.id === e.target.value)
                      setForm(f => ({ ...f, configId: e.target.value, bucketUri: bc?.bucketUri ?? f.bucketUri }))
                    }}>
                    <option value="">— Seleziona o inserisci manualmente —</option>
                    {buckets.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bucketUri})</option>)}
                  </select>
                </div>
                <div className="form-field span2">
                  <label>BUCKET URI *</label>
                  <input value={form.bucketUri} placeholder="gs://my-bucket/input/"
                    onChange={e => setForm(f => ({ ...f, bucketUri: e.target.value }))} />
                </div>
                <div className="form-field span2">
                  <label>NOME FILE *</label>
                  <input value={form.fileName} placeholder="data_20260601.parquet"
                    onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))} />
                </div>
              </div>

              <div className="form-actions">
                <button className="primary" onClick={handleTrigger} disabled={loading}>
                  {loading ? '⏳ Avvio...' : '▶ Avvia Job Spark'}
                </button>
              </div>

              {result && (
                <div className="pvSuccess" style={{ marginTop: 16 }}>
                  <strong>✅ Job avviato</strong>
                  <pre style={{ fontSize: 11, margin: '8px 0 0', overflow: 'auto' }}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Diagramma ──────────────────────────────────────────────── */}
        {tab === 'diagram' && (
          <div>
            <StateMachineDiagram />
            <div style={{ marginTop: 16, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 16,
              fontSize: 12, lineHeight: 1.8, color: 'var(--color-muted)' }}>
              <strong>Trigger supportati:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                <li><strong>GCS Eventarc</strong>: Storage → Eventarc → Cloud Run → <code>POST /api/batch-trigger</code></li>
                <li><strong>S3 SNS/SQS</strong>: S3 Event → SNS → Lambda → <code>POST /api/batch-trigger</code></li>
                <li><strong>Frontend</strong>: Pagina "Nuova Elaborazione" o tab "Trigger Manuale"</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


