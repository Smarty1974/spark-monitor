import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PvBadge, Drawer, Field, fmtDate } from '../components/DesignSystem'
import { AdvancedSearch, matchAdvanced, type FieldDef, type Criteria } from '../components/AdvancedSearch'
import { PartitaTable, type ColumnConfig } from '../components/PartitaTable'
import {
  getJobDefinitions, createJobDefinition, updateJobDefinition,
  deleteJobDefinition, runJobNow, type JobDefinition,
} from '../api/pvClient'

/* ─── Costanti UI ─────────────────────────────────────────────────────────── */

const JOB_TYPE_CFG = {
  SCHEDULED:  { label: 'Schedulato',   icon: '⏰', tone: 'blue'   as const },
  FILE_DRIVEN:{ label: 'File-Driven',  icon: '📁', tone: 'orange' as const },
}
const OUTPUT_MODE_CFG = {
  BUCKET_WRITE:        { label: 'Solo Bucket',          icon: '🪣', tone: 'teal'   as const },
  DATABASE_UPDATE:     { label: 'Solo Database',        icon: '🗄',  tone: 'purple' as const },
  BUCKET_AND_DATABASE: { label: 'Bucket + Database',    icon: '🪣🗄',tone: 'blue'   as const },
}

const SEARCH_FIELDS: FieldDef[] = [
  { key: 'name',     label: 'NOME',      type: 'text' },
  { key: 'category', label: 'CATEGORIA', type: 'text' },
  { key: 'jobType',  label: 'TIPO',      type: 'select',
    options: [{ value: 'SCHEDULED', label: '⏰ Schedulato' }, { value: 'FILE_DRIVEN', label: '📁 File-Driven' }] },
  { key: 'owner',    label: 'OWNER',     type: 'text' },
]

const EMPTY_JD: Partial<JobDefinition> = {
  jobType: 'SCHEDULED', enabled: true, maxConcurrentRuns: 1,
  maxRetries: 0, retryDelayMinutes: 5, sparkVersion: '3.5',
  executorMemory: '4g', executorCores: 2,
}

/* ─── Componente form per una sezione ────────────────────────────────────── */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      {children}
    </div>
  )
}

/* ─── Pagina principale ───────────────────────────────────────────────────── */

export function JobDefinitionPage() {
  const navigate = useNavigate()
  const [rows, setRows]           = useState<JobDefinition[]>([])
  const [crit, setCrit]           = useState<Criteria>({})
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState<Partial<JobDefinition> | null>(null)
  const [isNew, setIsNew]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [notice, setNotice]       = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'generale'|'trigger'|'output'|'gcp'|'comportamento'>('generale')

  useEffect(() => {
    getJobDefinitions().then(d => setRows(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => rows.filter(r => matchAdvanced(r as unknown as Record<string, unknown>, crit)),
    [rows, crit]
  )

  function openNew() {
    setEditing({ ...EMPTY_JD }); setIsNew(true); setError(''); setActiveTab('generale')
  }
  function openEdit(r: JobDefinition) {
    setEditing({ ...r }); setIsNew(false); setError(''); setActiveTab('generale')
  }

  async function save() {
    if (!editing) return
    if (!editing.name?.trim()) { setError('Il campo Nome è obbligatorio'); return }
    if (!editing.jobType)      { setError('Il campo Tipo Job è obbligatorio'); return }
    if (editing.jobType === 'SCHEDULED' && !editing.cronExpression?.trim())
      { setError('La Cron Expression è obbligatoria per i job Schedulati'); return }
    if (editing.jobType === 'FILE_DRIVEN' && !editing.inputBucketUri?.trim())
      { setError('Input Bucket URI è obbligatorio per i job File-Driven'); return }

    setSaving(true); setError('')
    try {
      if (isNew) {
        const c = await createJobDefinition(editing as JobDefinition)
        setRows(rs => [c, ...rs])
        setNotice(`✅ JobDefinition "${c.name}" creata`)
      } else {
        const u = await updateJobDefinition(editing.id!, editing as JobDefinition)
        setRows(rs => rs.map(r => r.id === editing.id ? u : r))
        setNotice(`✅ JobDefinition "${u.name}" aggiornata`)
      }
      setEditing(null)
    } catch (e) { setError('Errore: ' + String(e)) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    try {
      await deleteJobDefinition(id)
      setRows(rs => rs.filter(r => r.id !== id))
      setNotice('🗑 JobDefinition eliminata')
      setConfirmDel(null)
    } catch (e) { setError('Errore eliminazione: ' + String(e)) }
  }

  async function handleRunNow(id: string, name: string) {
    try {
      await runJobNow(id)
      setNotice(`▶ Job "${name}" messo in coda — partirà entro 1 minuto`)
    } catch (e) { setError('Errore avvio immediato: ' + String(e)) }
  }

  // Setter comodo per i campi del form
  const set = (key: keyof JobDefinition, val: unknown) =>
    setEditing(p => ({ ...p!, [key]: val }))

  const columns: ColumnConfig<JobDefinition>[] = [
    {
      key: 'name', label: 'NOME', flex: 1.8, sortValue: r => r.name,
      render: r => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
          {r.category && <div style={{ fontSize: 10, color: '#888' }}>{r.category}</div>}
        </div>
      ),
    },
    {
      key: 'jobType', label: 'TIPO', flex: 0.9,
      render: r => {
        const cfg = JOB_TYPE_CFG[r.jobType]
        return <PvBadge tone={cfg.tone}>{cfg.icon} {cfg.label}</PvBadge>
      },
    },
    {
      key: 'trigger', label: 'TRIGGER', flex: 1.4,
      render: r => r.jobType === 'SCHEDULED'
        ? <code style={{ fontSize: 10 }}>{r.cronExpression ?? '—'}</code>
        : <code style={{ fontSize: 10, color: '#555' }}>{r.inputBucketUri?.replace('gs://','') ?? '—'}</code>,
    },
    {
      key: 'outputMode', label: 'OUTPUT', flex: 1,
      render: r => {
        const cfg = r.outputMode ? OUTPUT_MODE_CFG[r.outputMode] : null
        return cfg ? <PvBadge tone={cfg.tone}>{cfg.icon} {cfg.label}</PvBadge> : <span style={{ color: '#ccc' }}>—</span>
      },
    },
    {
      key: 'enabled', label: 'STATO', flex: 0.6,
      render: r => <PvBadge tone={r.enabled ? 'green' : 'gray'}>{r.enabled ? '✅ ON' : '⏸ OFF'}</PvBadge>,
    },
    {
      key: 'owner', label: 'OWNER', flex: 0.8,
      render: r => <span style={{ fontSize: 11, color: '#888' }}>{r.owner ?? '—'}</span>,
    },
    {
      key: 'actions', label: 'AZIONI', flex: 0.8,
      render: r => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button title="Modifica" onClick={e => { e.stopPropagation(); openEdit(r) }}
            style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✏️</button>
          {r.jobType === 'SCHEDULED' && (
            <button title="Avvia ora" onClick={e => { e.stopPropagation(); handleRunNow(r.id!, r.name) }}
              style={{ fontSize: 11, padding: '2px 7px', background: '#e8f5e9', color: '#1b5e20', border: '1px solid #a5d6a7', borderRadius: 4, cursor: 'pointer' }}>▶</button>
          )}
          {r.jobType === 'FILE_DRIVEN' && (
            <button title="Avvia da frontend" onClick={e => { e.stopPropagation(); navigate('/nuova-elaborazione') }}
              style={{ fontSize: 11, padding: '2px 7px', background: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80', borderRadius: 4, cursor: 'pointer' }}>📁</button>
          )}
          <button title="Elimina" onClick={e => { e.stopPropagation(); setConfirmDel(r.id!) }}
            style={{ fontSize: 11, padding: '2px 7px', background: '#ffebee', color: '#b71c1c', border: '1px solid #ef9a9a', borderRadius: 4, cursor: 'pointer' }}>🗑</button>
        </div>
      ),
    },
  ]

  // ── Render detail ──────────────────────────────────────────────────────────

  function renderDetail(r: JobDefinition) {
    const jtCfg = JOB_TYPE_CFG[r.jobType]
    const omCfg = r.outputMode ? OUTPUT_MODE_CFG[r.outputMode] : null
    return (
      <>
        <div className="partitaDetailGrid">
          <Field label="NOME"            value={<strong>{r.name}</strong>} />
          <Field label="TIPO JOB"        value={<PvBadge tone={jtCfg.tone}>{jtCfg.icon} {jtCfg.label}</PvBadge>} />
          <Field label="DESCRIZIONE"     value={r.description} wide />
          <Field label="CATEGORIA"       value={r.category} />
          <Field label="OWNER"           value={r.owner} />

          {r.jobType === 'SCHEDULED' && <>
            <Field label="CRON EXPRESSION"  value={<code style={{ fontSize: 12 }}>{r.cronExpression}</code>} />
            <Field label="INTERPRETAZIONE"  value={<span style={{ fontSize: 11, color: '#1565c0' }}>{describeCron(r.cronExpression)}</span>} />
          </>}

          {r.jobType === 'FILE_DRIVEN' && <>
            <Field label="INPUT BUCKET"  value={<code style={{ fontSize: 10 }}>{r.inputBucketUri}</code>} wide />
            <Field label="FILE PATTERN"  value={<code>{r.filePattern}</code>} />
          </>}

          <Field label="OUTPUT MODE"     value={omCfg ? <PvBadge tone={omCfg.tone}>{omCfg.icon} {omCfg.label}</PvBadge> : '—'} />
          {r.outputBucketUri && <Field label="OUTPUT BUCKET"  value={<code style={{ fontSize: 10 }}>{r.outputBucketUri}</code>} wide />}
          {r.outputDbTarget  && <Field label="DB TARGET"      value={<code>{r.outputDbTarget}</code>} />}
          {r.outputDbType    && <Field label="DB TIPO"        value={r.outputDbType} />}
          {r.outputWriteMode && <Field label="WRITE MODE"     value={<PvBadge tone="gray">{r.outputWriteMode}</PvBadge>} />}

          <Field label="SCRIPT SPARK"    value={<code style={{ fontSize: 9, wordBreak: 'break-all' }}>{r.sparkMainScript}</code>} wide />
          {r.sparkArguments && r.sparkArguments.length > 0 && (
            <Field label="ARGOMENTI SPARK" value={
              <div style={{ fontFamily: 'monospace', fontSize: 10 }}>
                {r.sparkArguments.map((a, i) => <div key={i}>{a}</div>)}
              </div>
            } wide />
          )}
          <Field label="VERSIONE SPARK"  value={r.sparkVersion} />
          <Field label="EXEC MEMORY"     value={r.executorMemory} />
          <Field label="EXEC CORES"      value={r.executorCores} />
          <Field label="TIMEOUT"         value={r.timeoutMinutes ? `${r.timeoutMinutes} min` : 'default (120 min)'} />
          <Field label="MAX CONCURRENT"  value={r.maxConcurrentRuns} />
          <Field label="MAX RETRIES"     value={r.maxRetries} />
          <Field label="RETRY DELAY"     value={r.retryDelayMinutes ? `${r.retryDelayMinutes} min` : '—'} />
          {r.alertEmails && r.alertEmails.length > 0 && (
            <Field label="ALERT EMAIL"   value={r.alertEmails.join(', ')} wide />
          )}
          {r.webhookUrl && <Field label="WEBHOOK"     value={<code style={{ fontSize: 9 }}>{r.webhookUrl}</code>} wide />}
          {r.tags && r.tags.length > 0 && (
            <Field label="TAG"           value={r.tags.map(t => <PvBadge key={t} tone="gray">{t}</PvBadge>)} />
          )}
          <Field label="CREATO"          value={fmtDate(r.createdAt)} />
          <Field label="AGGIORNATO"      value={fmtDate(r.updatedAt)} />
        </div>
        <div className="jumpBar">
          {r.jobType === 'SCHEDULED' && r.id && (
            <button onClick={() => handleRunNow(r.id!, r.name)}>▶ Avvia ora</button>
          )}
          {r.jobType === 'FILE_DRIVEN' && (
            <button onClick={() => navigate('/nuova-elaborazione')}>📁 Nuova elaborazione</button>
          )}
          <button onClick={() => navigate('/processi')}>🔍 Inquiry processi</button>
        </div>
      </>
    )
  }

  // ── Render drawer form ─────────────────────────────────────────────────────

  function renderDrawer() {
    if (!editing) return null
    const TABS = ['generale', 'trigger', 'output', 'gcp', 'comportamento'] as const
    return (
      <Drawer
        title={isNew ? '➕ Nuova Job Definition' : `✏️ Modifica — ${editing.name}`}
        onClose={() => { setEditing(null); setError('') }}>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: 'none', border: 'none',
                cursor: 'pointer', color: activeTab === t ? 'var(--color-accent)' : '#888',
                borderBottom: activeTab === t ? '2px solid var(--color-accent)' : '2px solid transparent',
                marginBottom: -1, textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>

        {error && <div className="pvError" style={{ marginBottom: 12 }}>{error}</div>}

        {/* ── Tab: Generale ──────────────────────────────────────────── */}
        {activeTab === 'generale' && (
          <div className="form-grid">
            <FormField label="NOME *">
              <input value={editing.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="report-vendite-giornaliero" />
            </FormField>
            <FormField label="TIPO JOB *">
              <select value={editing.jobType ?? 'SCHEDULED'} onChange={e => set('jobType', e.target.value)}>
                <option value="SCHEDULED">⏰ Schedulato (cron)</option>
                <option value="FILE_DRIVEN">📁 File-Driven (bucket event)</option>
              </select>
            </FormField>
            <div className="form-field span2">
              <label>DESCRIZIONE</label>
              <textarea value={editing.description ?? ''} rows={3}
                onChange={e => set('description', e.target.value)}
                placeholder="Descrivi lo scopo e il comportamento del job" />
            </div>
            <FormField label="CATEGORIA">
              <input value={editing.category ?? ''} onChange={e => set('category', e.target.value)} placeholder="etl, reporting, anagrafica..." />
            </FormField>
            <FormField label="OWNER">
              <input value={editing.owner ?? ''} onChange={e => set('owner', e.target.value)} placeholder="team-data-eng" />
            </FormField>
            <div className="form-field span2">
              <label>TAG (separati da virgola)</label>
              <input value={(editing.tags ?? []).join(', ')}
                onChange={e => set('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                placeholder="daily, etl, vendite" />
            </div>
            <div className="form-field span2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="jdEnabled" checked={editing.enabled ?? true}
                onChange={e => set('enabled', e.target.checked)} />
              <label htmlFor="jdEnabled" style={{ textTransform: 'none', fontSize: 13, fontWeight: 400 }}>
                Job abilitato (viene avviato automaticamente)
              </label>
            </div>
          </div>
        )}

        {/* ── Tab: Trigger ───────────────────────────────────────────── */}
        {activeTab === 'trigger' && (
          <div>
            {editing.jobType === 'SCHEDULED' && (
              <div className="form-grid">
                <div className="form-field span2">
                  <label>CRON EXPRESSION *</label>
                  <input value={editing.cronExpression ?? ''} onChange={e => set('cronExpression', e.target.value)}
                    placeholder="0 0 2 * * ?" style={{ fontFamily: 'monospace' }} />
                  {editing.cronExpression && (
                    <div style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 4 }}>
                      📅 {describeCron(editing.cronExpression)}
                    </div>
                  )}
                </div>
                <div className="form-field span2">
                  <label>ESEMPI CRON</label>
                  <div style={{ fontSize: 11, color: '#888', lineHeight: 2, fontFamily: 'monospace' }}>
                    {[
                      ['0 0 2 * * ?',   'Ogni giorno alle 02:00'],
                      ['0 0 2,14 * * ?','Alle 02:00 e 14:00'],
                      ['0 0 */6 * * ?', 'Ogni 6 ore (00, 06, 12, 18)'],
                      ['0 30 8 * * 1-5','Lun-Ven alle 08:30'],
                      ['0 0 0 1 * ?',   'Il 1° di ogni mese a mezzanotte'],
                      ['0 0 3 * * 1',   'Ogni lunedì alle 03:00'],
                    ].map(([cron, desc]) => (
                      <div key={cron} style={{ cursor: 'pointer' }}
                        onClick={() => set('cronExpression', cron)}>
                        <span style={{ color: 'var(--color-accent)' }}>{cron}</span>
                        <span style={{ color: '#888' }}> → {desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {editing.jobType === 'FILE_DRIVEN' && (
              <div className="form-grid">
                <div className="form-field span2">
                  <label>INPUT BUCKET URI *</label>
                  <input value={editing.inputBucketUri ?? ''} onChange={e => set('inputBucketUri', e.target.value)}
                    placeholder="gs://my-bucket/input/  oppure  s3://my-bucket/input/" />
                </div>
                <FormField label="FILE PATTERN">
                  <input value={editing.filePattern ?? ''} onChange={e => set('filePattern', e.target.value)}
                    placeholder="*.parquet  oppure  data_*.csv" />
                </FormField>
                <div className="form-field">
                  <label style={{ fontSize: 11, color: '#888' }}>ℹ️ Il job parte automaticamente quando arriva un file che corrisponde al pattern nel bucket.</label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Output ────────────────────────────────────────────── */}
        {activeTab === 'output' && (
          <div className="form-grid">
            <div className="form-field span2">
              <label>MODALITÀ OUTPUT *</label>
              <select value={editing.outputMode ?? ''} onChange={e => set('outputMode', e.target.value || undefined)}>
                <option value="">— Seleziona —</option>
                <option value="BUCKET_WRITE">🪣 Solo Bucket — scrive file su GCS/S3</option>
                <option value="DATABASE_UPDATE">🗄 Solo Database — aggiorna/inserisce record</option>
                <option value="BUCKET_AND_DATABASE">🪣🗄 Bucket + Database — scrive su entrambi</option>
              </select>
            </div>

            {(editing.outputMode === 'BUCKET_WRITE' || editing.outputMode === 'BUCKET_AND_DATABASE') && (
              <div className="form-field span2">
                <label>OUTPUT BUCKET URI</label>
                <input value={editing.outputBucketUri ?? ''} onChange={e => set('outputBucketUri', e.target.value)}
                  placeholder="gs://reports-bucket/output/" />
              </div>
            )}

            {(editing.outputMode === 'DATABASE_UPDATE' || editing.outputMode === 'BUCKET_AND_DATABASE') && (
              <>
                <FormField label="TIPO DATABASE">
                  <select value={editing.outputDbType ?? ''} onChange={e => set('outputDbType', e.target.value || undefined)}>
                    <option value="">— Seleziona —</option>
                    {['BigQuery','PostgreSQL','MongoDB','MySQL','Spanner','Snowflake','Redshift'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="DATASET / SCHEMA / COLLECTION TARGET">
                  <input value={editing.outputDbTarget ?? ''} onChange={e => set('outputDbTarget', e.target.value)}
                    placeholder="analytics.daily_sales  oppure  public.orders" />
                </FormField>
                <FormField label="WRITE MODE">
                  <select value={editing.outputWriteMode ?? ''} onChange={e => set('outputWriteMode', e.target.value || undefined)}>
                    <option value="">— Seleziona —</option>
                    {['OVERWRITE','APPEND','UPSERT','MERGE','INSERT_IGNORE'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </FormField>
              </>
            )}
          </div>
        )}

        {/* ── Tab: GCP / Spark ───────────────────────────────────────── */}
        {activeTab === 'gcp' && (
          <div className="form-grid">
            <FormField label="GCP PROJECT ID">
              <input value={editing.gcpProjectId ?? ''} onChange={e => set('gcpProjectId', e.target.value)} placeholder="my-gcp-project" />
            </FormField>
            <FormField label="GCP REGION">
              <select value={editing.gcpRegion ?? 'europe-west1'} onChange={e => set('gcpRegion', e.target.value)}>
                {['europe-west1','europe-west2','europe-west3','us-central1','us-east1','asia-east1'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </FormField>
            <div className="form-field span2">
              <label>SCRIPT SPARK PRINCIPALE (GCS URI)</label>
              <input value={editing.sparkMainScript ?? ''} onChange={e => set('sparkMainScript', e.target.value)}
                placeholder="gs://scripts-bucket/jobs/my_job.py" />
            </div>
            <div className="form-field span2">
              <label>ARGOMENTI SPARK (uno per riga — placeholder: {'{date}'} {'{outputBucketUri}'} {'{inputFile}'})</label>
              <textarea value={(editing.sparkArguments ?? []).join('\n')} rows={4}
                onChange={e => set('sparkArguments', e.target.value.split('\n').filter(Boolean))}
                placeholder={'--date={date}\n--output={outputBucketUri}\n--mode=overwrite'}
                style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
            </div>
            <FormField label="VERSIONE SPARK">
              <select value={editing.sparkVersion ?? '3.5'} onChange={e => set('sparkVersion', e.target.value)}>
                {['3.5','3.4','3.3','2.4'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="EXECUTOR MEMORY">
              <select value={editing.executorMemory ?? '4g'} onChange={e => set('executorMemory', e.target.value)}>
                {['1g','2g','4g','8g','16g','32g'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </FormField>
            <FormField label="EXECUTOR CORES">
              <select value={String(editing.executorCores ?? 2)} onChange={e => set('executorCores', parseInt(e.target.value))}>
                {[1,2,4,8,16].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
          </div>
        )}

        {/* ── Tab: Comportamento ─────────────────────────────────────── */}
        {activeTab === 'comportamento' && (
          <div className="form-grid">
            <FormField label="TIMEOUT (minuti, vuoto = default 120)">
              <input type="number" value={editing.timeoutMinutes ?? ''} onChange={e => set('timeoutMinutes', e.target.value ? parseInt(e.target.value) : undefined)} placeholder="120" />
            </FormField>
            <FormField label="MAX ESECUZIONI CONCORRENTI">
              <input type="number" min={1} value={editing.maxConcurrentRuns ?? 1} onChange={e => set('maxConcurrentRuns', parseInt(e.target.value) || 1)} />
            </FormField>
            <FormField label="MAX RETRY AUTOMATICI">
              <input type="number" min={0} value={editing.maxRetries ?? 0} onChange={e => set('maxRetries', parseInt(e.target.value) || 0)} />
            </FormField>
            <FormField label="ATTESA TRA RETRY (minuti)">
              <input type="number" min={1} value={editing.retryDelayMinutes ?? 5} onChange={e => set('retryDelayMinutes', parseInt(e.target.value) || 5)} />
            </FormField>
            <div className="form-field span2">
              <label>EMAIL ALERT SU FAILED (una per riga)</label>
              <textarea value={(editing.alertEmails ?? []).join('\n')} rows={3}
                onChange={e => set('alertEmails', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                placeholder={'ops@azienda.it\nteam-data@azienda.it'} />
            </div>
            <div className="form-field span2">
              <label>WEBHOOK (Slack / Teams / custom)</label>
              <input value={editing.webhookUrl ?? ''} onChange={e => set('webhookUrl', e.target.value || undefined)}
                placeholder="https://hooks.slack.com/services/..." />
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="secondary" onClick={() => { setEditing(null); setError('') }} disabled={saving}>Annulla</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? '⏳ Salvataggio...' : '💾 Salva'}
          </button>
        </div>
      </Drawer>
    )
  }

  // ── Render pagina ──────────────────────────────────────────────────────────

  const scheduledCount  = rows.filter(r => r.jobType === 'SCHEDULED').length
  const fileDrivenCount = rows.filter(r => r.jobType === 'FILE_DRIVEN').length
  const enabledCount    = rows.filter(r => r.enabled).length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚡ Job Definitions</h1>
        <p className="page-sub">Censimento e configurazione di tutti i job Spark monitorati dalla state machine</p>
      </div>

      <div className="pvPage">
        {error  && <div className="pvError">{error}</div>}
        {notice && <div className="pvSuccess">{notice}<button onClick={() => setNotice('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

        {/* Stat cards */}
        <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
          {[
            { label: 'Totale',      value: rows.length,    color: '#555' },
            { label: '⏰ Schedulati',value: scheduledCount, color: '#1565c0' },
            { label: '📁 File-Driven',value:fileDrivenCount,color: '#e65100' },
            { label: '✅ Abilitati', value: enabledCount,  color: '#1b5e20' },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
              <div className="stat-card-label">{label}</div>
              <div className="stat-card-value" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <button className="primary" onClick={openNew}>➕ Nuova Job Definition</button>
          <div className="toolbar-right">
            <span style={{ fontSize: 12, color: 'var(--color-muted)', alignSelf: 'center' }}>
              {filtered.length} definizioni
            </span>
          </div>
        </div>

        <AdvancedSearch fields={SEARCH_FIELDS} value={crit} onChange={setCrit}
          totalCount={rows.length} filteredCount={filtered.length}
          title="Ricerca Job Definitions" />

        {loading && <div className="pvHint">Caricamento...</div>}

        <PartitaTable
          rows={filtered} columns={columns} getRowId={r => r.id ?? r.name}
          emptyMessage="Nessuna Job Definition configurata. Creane una per iniziare a monitorare i tuoi job Spark."
          renderDetail={renderDetail}
        />

        {renderDrawer()}

        {/* Modal conferma eliminazione */}
        {confirmDel && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1400,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 28,
              maxWidth: 400, boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px' }}>Elimina Job Definition?</h3>
              <p style={{ margin: '0 0 20px', color: 'var(--color-muted)', fontSize: 13 }}>
                I BatchProcess già eseguiti non verranno eliminati, ma il job non verrà più avviato automaticamente.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="secondary" onClick={() => setConfirmDel(null)}>Annulla</button>
                <button className="danger-btn" onClick={() => handleDelete(confirmDel)}>Elimina</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Helper: descrizione human-readable della cron ──────────────────────── */

function describeCron(cron?: string): string {
  if (!cron) return ''
  const p = cron.trim().split(/\s+/)
  if (p.length < 6) return 'Espressione non valida'
  const [, min, hour, dom, mon, dow] = p
  const parts: string[] = []
  if (hour === '*') parts.push('ogni ora')
  else if (hour.includes('*/')) parts.push(`ogni ${hour.replace('*/','')} ore`)
  else if (hour.includes(',')) parts.push(`alle ore ${hour.replace(/,/g,', ')}`)
  else parts.push(`alle ${hour.padStart(2,'0')}:${min === '0' ? '00' : min}`)

  if (dow !== '*' && dow !== '?') {
    const days = ['','Lun','Mar','Mer','Gio','Ven','Sab','Dom']
    if (dow.includes('-')) {
      const [f,t] = dow.split('-')
      parts.push(`${days[+f] ?? dow} - ${days[+t] ?? t}`)
    } else {
      parts.push(days[+dow] ?? 'Giorno: ' + dow)
    }
  }
  if (dom !== '*' && dom !== '?') parts.push(`giorno ${dom} del mese`)
  return parts.join(', ')
}
