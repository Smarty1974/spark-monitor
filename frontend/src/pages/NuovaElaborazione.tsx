import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBucketConfigs, triggerBatchFlow, type BucketConfig, type TriggerRequest } from '../api/pvClient'

const STORAGE_TYPES = ['GCS', 'S3']
const REGIONS = ['europe-west1', 'europe-west2', 'us-central1', 'us-east1', 'asia-east1']

type Mode = 'singolo' | 'bulk'

interface BulkRow { fileName: string; bucketUri: string; configId: string; valid: boolean }

function parseBulk(text: string, buckets: BucketConfig[]): BulkRow[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(';').map(p => p.trim())
      const fileName  = parts[0] ?? ''
      const bucketUri = parts[1] ?? ''
      const configId  = buckets.find(b => b.bucketUri === bucketUri)?.id ?? ''
      return { fileName, bucketUri, configId, valid: !!fileName && !!bucketUri }
    })
}

export function NuovaElaborazione() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('singolo')
  const [buckets, setBuckets] = useState<BucketConfig[]>([])
  const [selectedConfig, setSelectedConfig] = useState<string>('')
  const [form, setForm] = useState<TriggerRequest>({
    bucketUri: '', fileName: '', metadataJson: '', fileSizeBytes: undefined,
  })
  const [bulkText, setBulkText] = useState('')
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [errors, setErrors]     = useState<string[]>([])

  useEffect(() => {
    getBucketConfigs().then(d => setBuckets(Array.isArray(d) ? d : []))
  }, [])

  // Precompila il form dalla config bucket selezionata
  function onConfigChange(id: string) {
    setSelectedConfig(id)
    const bc = buckets.find(b => b.id === id)
    if (bc) setForm(f => ({ ...f, bucketUri: bc.bucketUri, bucketConfigId: id }))
  }

  // Aggiorna preview bulk
  useEffect(() => {
    setBulkRows(parseBulk(bulkText, buckets))
  }, [bulkText, buckets])

  async function submitSingolo() {
    if (!form.fileName.trim() || !form.bucketUri.trim()) {
      setError('Nome file e Bucket URI sono obbligatori')
      return
    }
    setLoading(true); setError(''); setSuccess('')
    try {
      await triggerBatchFlow({ ...form, bucketConfigId: selectedConfig || undefined })
      setSuccess(`✅ Elaborazione "${form.fileName}" avviata con successo!`)
      setForm({ bucketUri: '', fileName: '', metadataJson: '', fileSizeBytes: undefined })
      setSelectedConfig('')
    } catch (e) {
      setError('Errore avvio elaborazione: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  async function submitBulk() {
    const valid = bulkRows.filter(r => r.valid)
    if (valid.length === 0) { setError('Nessuna riga valida da inviare'); return }
    setLoading(true); setError(''); setSuccess(''); setErrors([])
    const errs: string[] = []
    let ok = 0
    for (const row of valid) {
      try {
        await triggerBatchFlow({ fileName: row.fileName, bucketUri: row.bucketUri, bucketConfigId: row.configId || undefined })
        ok++
      } catch (e) {
        errs.push(`${row.fileName}: ${String(e)}`)
      }
    }
    setLoading(false)
    if (ok > 0) setSuccess(`✅ ${ok} elaborazioni avviate con successo${errs.length > 0 ? `, ${errs.length} fallite` : ''}`)
    if (errs.length > 0) setErrors(errs)
    if (ok > 0) setBulkText('')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">➕ Nuova Elaborazione</h1>
        <p className="page-sub">Censisci e avvia uno o più job Spark su GCP Dataproc Serverless</p>
        <div className="page-tabs">
          <button className={`page-tab ${mode === 'singolo' ? 'active' : ''}`}
            onClick={() => setMode('singolo')}>Singola elaborazione</button>
          <button className={`page-tab ${mode === 'bulk' ? 'active' : ''}`}
            onClick={() => setMode('bulk')}>Import bulk</button>
        </div>
      </div>

      <div className="pvPage">

        {error   && <div className="pvError">{error}</div>}
        {success && <div className="pvSuccess">{success}</div>}
        {errors.length > 0 && (
          <div className="pvError">
            <strong>Errori:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {errors.map((e, i) => <li key={i} style={{ fontSize: 11 }}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* ── Singola ──────────────────────────────────────────────────── */}
        {mode === 'singolo' && (
          <div style={{ maxWidth: 680 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)', padding: 24 }}>
              <h3 style={{ margin: '0 0 18px', fontSize: 15 }}>Dettagli elaborazione</h3>

              <div className="form-grid">
                {/* Config bucket */}
                <div className="form-field span2">
                  <label>CONFIGURAZIONE BUCKET (opzionale — precompila i campi)</label>
                  <select value={selectedConfig} onChange={e => onConfigChange(e.target.value)}>
                    <option value="">— Seleziona una configurazione salvata —</option>
                    {buckets.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.bucketUri} ({b.storageType})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bucket URI */}
                <div className="form-field span2">
                  <label>BUCKET URI *</label>
                  <input
                    value={form.bucketUri}
                    onChange={e => setForm(f => ({ ...f, bucketUri: e.target.value }))}
                    placeholder="gs://my-bucket/input/  oppure  s3://my-bucket/input/"
                    className={!form.bucketUri && error ? 'error' : ''}
                  />
                </div>

                {/* File name */}
                <div className="form-field span2">
                  <label>NOME FILE *</label>
                  <input
                    value={form.fileName}
                    onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))}
                    placeholder="data_20260601.parquet"
                    className={!form.fileName && error ? 'error' : ''}
                  />
                </div>

                {/* Dimensione */}
                <div className="form-field">
                  <label>DIMENSIONE FILE (byte, opzionale)</label>
                  <input
                    type="number"
                    value={form.fileSizeBytes ?? ''}
                    onChange={e => setForm(f => ({ ...f, fileSizeBytes: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="es. 1048576"
                  />
                </div>

                {/* Metadati */}
                <div className="form-field">
                  <label>METADATI JSON (opzionale)</label>
                  <input
                    value={form.metadataJson ?? ''}
                    onChange={e => setForm(f => ({ ...f, metadataJson: e.target.value }))}
                    placeholder='{"source":"sftp","priority":"high"}'
                  />
                </div>
              </div>

              {/* Info config selezionata */}
              {selectedConfig && (() => {
                const bc = buckets.find(b => b.id === selectedConfig)
                if (!bc) return null
                return (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--color-accent-dim)',
                    borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--color-accent)' }}>
                    <strong>{bc.name}</strong> · Pattern: <code>{bc.filePattern}</code>
                    · Max job: {bc.maxConcurrentJobs} · Trigger: {bc.triggerEnabled ? '✅ abilitato' : '⏸ disabilitato'}
                  </div>
                )
              })()}

              <div className="form-actions">
                <button className="secondary" onClick={() => navigate('/processi')}>Annulla</button>
                <button className="primary" onClick={submitSingolo} disabled={loading}>
                  {loading ? '⏳ Avvio...' : '▶ Avvia Elaborazione'}
                </button>
              </div>
            </div>

            {/* Link a configurazioni */}
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-muted)' }}>
              Non trovi la configurazione bucket?{' '}
              <button onClick={() => navigate('/bucket-configs')}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent)',
                  cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                Crea una nuova configurazione →
              </button>
            </div>
          </div>
        )}

        {/* ── Bulk ─────────────────────────────────────────────────────── */}
        {mode === 'bulk' && (
          <div style={{ maxWidth: 800 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)', padding: 24 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Import bulk elaborazioni</h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                Inserisci una riga per elaborazione nel formato:<br />
                <code style={{ background: 'var(--color-bg)', padding: '2px 6px', borderRadius: 4 }}>
                  nome_file.parquet ; gs://bucket/path/
                </code>
              </p>

              <div className="form-field">
                <label>LISTA ELABORAZIONI (una per riga, separatore ";")</label>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={8}
                  placeholder={`data_20260601.parquet;gs://my-bucket/input/\ntransactions_june.csv;gs://my-bucket/csv/\nreport_Q2.json;gs://other-bucket/reports/`}
                  style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                />
              </div>

              {/* Preview */}
              {bulkRows.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)',
                    textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                    ANTEPRIMA — {bulkRows.filter(r => r.valid).length} valide · {bulkRows.filter(r => !r.valid).length} non valide
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--color-border)',
                    borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)' }}>
                          {['', 'File', 'Bucket URI', 'Config rilevata'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10,
                              fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--color-border)',
                            background: row.valid ? undefined : '#fff8f8' }}>
                            <td style={{ padding: '5px 10px' }}>
                              {row.valid ? '✅' : '❌'}
                            </td>
                            <td style={{ padding: '5px 10px' }}>
                              <code style={{ fontSize: 11 }}>{row.fileName || '—'}</code>
                            </td>
                            <td style={{ padding: '5px 10px' }}>
                              <code style={{ fontSize: 10, color: 'var(--color-muted)' }}>{row.bucketUri || '—'}</code>
                            </td>
                            <td style={{ padding: '5px 10px' }}>
                              {row.configId
                                ? <span style={{ fontSize: 11, color: 'var(--color-success)' }}>
                                    {buckets.find(b => b.id === row.configId)?.name ?? row.configId}
                                  </span>
                                : <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button className="secondary" onClick={() => setBulkText('')}>Pulisci</button>
                <button className="primary"
                  onClick={submitBulk}
                  disabled={loading || bulkRows.filter(r => r.valid).length === 0}>
                  {loading ? '⏳ Invio...' : `▶ Avvia ${bulkRows.filter(r => r.valid).length} Elaborazioni`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
