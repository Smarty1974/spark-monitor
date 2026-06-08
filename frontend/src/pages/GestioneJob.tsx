import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PvBadge, Drawer, Field, fmtDate, fmtN } from '../components/DesignSystem'
import { AdvancedSearch, matchAdvanced, type FieldDef, type Criteria } from '../components/AdvancedSearch'
import { PartitaTable, type ColumnConfig } from '../components/PartitaTable'
import {
  getJobDefinitions, createJobDefinition, updateJobDefinition,
  deleteJobDefinition, runJobNow, type JobDefinition, type JobType, type OutputMode,
} from '../api/pvClient'

// ── Lookup labels ─────────────────────────────────────────────────────────────

const JOB_TYPE_LABEL: Record<string, string> = {
  SCHEDULED:  '⏰ Schedulato',
  FILE_DRIVEN:'📥 File-Driven',
}

const OUTPUT_MODE_LABEL: Record<string, string> = {
  BUCKET_WRITE:         '🪣 Bucket',
  DATABASE_UPDATE:      '🗄 Database',
  BUCKET_AND_DATABASE:  '🪣🗄 Bucket + DB',
}

const CRON_PRESETS = [
  { label: 'Ogni giorno alle 02:00',      value: '0 0 2 * * ?' },
  { label: 'Ogni giorno alle 06:00',      value: '0 0 6 * * ?' },
  { label: 'Ogni giorno alle 08:00',      value: '0 0 8 * * ?' },
  { label: 'Due volte al giorno (02,14)', value: '0 0 2,14 * * ?' },
  { label: 'Ogni 6 ore',                 value: '0 0 */6 * * ?' },
  { label: 'Ogni ora',                   value: '0 0 * * * ?' },
  { label: 'Lun-Ven alle 07:30',         value: '0 30 7 * * 1-5' },
  { label: 'Ogni domenica alle 01:00',   value: '0 0 1 * * 7' },
  { label: 'Il 1° del mese a mezzanotte',value: '0 0 0 1 * ?' },
  { label: 'Personalizzata…',            value: '' },
]

const WRITE_MODES = ['OVERWRITE', 'APPEND', 'UPSERT', 'MERGE']
const DB_TYPES    = ['BigQuery', 'PostgreSQL', 'MySQL', 'MongoDB', 'Spanner', 'Redshift']
const CATEGORIES  = ['reporting', 'etl', 'anagrafica', 'aggregazione', 'export', 'import', 'ml', 'altro']

// ── Search fields ─────────────────────────────────────────────────────────────

const SEARCH_FIELDS: FieldDef[] = [
  { key: 'name',     label: 'NOME JOB',  type: 'text' },
  { key: 'category', label: 'CATEGORIA', type: 'text' },
  { key: 'jobType',  label: 'TIPO',      type: 'select',
    options: [
      { value: 'SCHEDULED',   label: '⏰ Schedulato' },
      { value: 'FILE_DRIVEN', label: '📥 File-Driven' },
    ]},
  { key: 'owner',    label: 'OWNER',     type: 'text' },
]

// ── Form helpers ──────────────────────────────────────────────────────────────

const EMPTY_JD: JobDefinition = {
  name: '', description: '', jobType: 'SCHEDULED', category: '',
  cronExpression: '', inputBucketUri: '', filePattern: '*.parquet',
  outputMode: 'BUCKET_WRITE', outputBucketUri: '', outputDbType: 'BigQuery',
  outputDbTarget: '', outputWriteMode: 'APPEND',
  gcpProjectId: '', gcpRegion: 'europe-west1',
  sparkMainScript: '', sparkArguments: [], sparkVersion: '3.5',
  executorMemory: '4g', executorCores: 2,
  enabled: true, maxConcurrentRuns: 1, timeoutMinutes: 120,
  maxRetries: 0, retryDelayMinutes: 5,
  alertEmails: [], webhookUrl: '', tags: [], owner: '',
}

// ── Componente principale ─────────────────────────────────────────────────────

export function GestioneJob() {
  const navigate = useNavigate()
  const [rows, setRows]         = useState<JobDefinition[]>([])
  const [crit, setCrit]         = useState<Criteria>({})
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<JobDefinition | null>(null)
  const [isNew, setIsNew]       = useState(false)
  const [formTab, setFormTab]   = useState<'base' | 'output' | 'dataproc' | 'avanzate'>('base')
  const [saving, setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')

  useEffect(() => {
    getJobDefinitions()
      .then(d => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => rows.filter(r => matchAdvanced(r as unknown as Record<string, unknown>, crit)),
    [rows, crit]
  )

  async function save() {
    if (!editing) return
    if (!editing.name?.trim()) { setError('Il nome è obbligatorio'); return }
    if (!editing.jobType)      { setError('Il tipo è obbligatorio'); return }
    if (editing.jobType === 'SCHEDULED' && !editing.cronExpression?.trim())
      { setError('La cron expression è obbligatoria per job Schedulati'); return }
    if (editing.jobType === 'FILE_DRIVEN' && !editing.inputBucketUri?.trim())
      { setError('Il bucket di input è obbligatorio per job File-Driven'); return }
    setSaving(true); setError('')
    try {
      if (isNew) {
        const c = await createJobDefinition(editing)
        setRows(rs => [c, ...rs])
        setNotice(`✅ Job "${c.name}" creato`)
      } else {
        const u = await updateJobDefinition(editing.id!, editing)
        setRows(rs => rs.map(r => r.id === editing.id ? u : r))
        setNotice(`✅ Job "${u.name}" aggiornato`)
      }
      setEditing(null)
    } catch (e) { setError('Errore: ' + String(e)) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    try {
      await deleteJobDefinition(id)
      setRows(rs => rs.filter(r => r.id !== id))
      setNotice('🗑 Job eliminato')
      setConfirmDel(null)
    } catch (e) { setError('Errore eliminazione: ' + String(e)) }
  }

  async function handleRunNow(id: string, name: string) {
    try {
      await runJobNow(id)
      setNotice(`▶ Job "${name}" avviato — sarà in esecuzione entro 1 minuto`)
    } catch (e) { setError('Errore avvio: ' + String(e)) }
  }

  const columns: ColumnConfig<JobDefinition>[] = [
    {
      key: 'name', label: 'NOME JOB', flex: 1.5,
      sortValue: r => r.name,
      render: r => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1565c0' }}>{r.name}</div>
          {r.category && <span style={{ fontSize: 10, color: '#888' }}>{r.category}</span>}
        </div>
      ),
    },
    {
      key: 'jobType', label: 'TIPO', flex: 0.8,
      render: r => (
        <PvBadge tone={r.jobType === 'SCHEDULED' ? 'purple' : 'blue'}>
          {JOB_TYPE_LABEL[r.jobType] ?? r.jobType}
        </PvBadge>
      ),
    },
    {
      key: 'trigger', label: 'TRIGGER', flex: 1.2,
      render: r => r.jobType === 'SCHEDULED'
        ? <code style={{ fontSize: 10, color: '#6a1b9a' }}>{r.cronExpression}</code>
        : <div>
            <code style={{ fontSize: 9, color: '#1565c0' }}>{r.inputBucketUri}</code>
            {r.filePattern && <div style={{ fontSize: 10, color: '#aaa' }}>{r.filePattern}</div>}
          </div>,
    },
    {
      key: 'outputMode', label: 'OUTPUT', flex: 0.9,
      render: r => r.outputMode
        ? <PvBadge tone={
            r.outputMode === 'BUCKET_WRITE' ? 'teal' :
            r.outputMode === 'DATABASE_UPDATE' ? 'orange' : 'blue'
          }>{OUTPUT_MODE_LABEL[r.outputMode]}</PvBadge>
        : '—',
    },
    {
      key: 'enabled', label: 'STATO', flex: 0.6,
      render: r => <PvBadge tone={r.enabled ? 'green' : 'gray'}>
        {r.enabled ? '✅ Attivo' : '⏸ Inattivo'}
      </PvBadge>,
    },
    {
      key: 'owner', label: 'OWNER', flex: 0.7,
      render: r => <span style={{ fontSize: 11, color: '#666' }}>{r.owner ?? '—'}</span>,
    },
    {
      key: 'act', label: 'AZIONI', flex: 0.9,
      render: r => (
        <div style={{ display: 'flex', gap: 4 }}>
          {r.jobType === 'SCHEDULED' && r.enabled && (
            <button onClick={e => { e.stopPropagation(); handleRunNow(r.id!, r.name) }}
              title="Avvia ora"
              style={{ fontSize: 11, padding: '2px 8px', background: '#e8f5e9',
                color: '#1b5e20', border: '1px solid #a5d6a7', borderRadius: 4, cursor: 'pointer' }}>
              ▶
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); navigate('/processi') }}
            title="Vedi esecuzioni"
            style={{ fontSize: 11, padding: '2px 8px', background: '#e3f2fd',
              color: '#1565c0', border: '1px solid #90caf9', borderRadius: 4, cursor: 'pointer' }}>
            🔍
          </button>
          <button onClick={e => { e.stopPropagation(); setEditing({ ...r }); setIsNew(false); setFormTab('base') }}
            style={{ fontSize: 11, padding: '2px 8px', background: 'var(--color-accent)', color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            ✏️
          </button>
          <button onClick={e => { e.stopPropagation(); setConfirmDel(r.id!) }}
            style={{ fontSize: 11, padding: '2px 8px', background: '#ffebee', color: '#b71c1c',
              border: '1px solid #ef9a9a', borderRadius: 4, cursor: 'pointer' }}>
            🗑
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚙️ Gestione Job</h1>
        <p className="page-sub">Censisci e configura i job Spark: schedulati a orario e file-driven da bucket</p>
      </div>

      <div className="pvPage">
        {error  && <div className="pvError">{error}</div>}
        {notice && <div className="pvSuccess">{notice}</div>}

        <div className="toolbar">
          <button className="primary"
            onClick={() => { setEditing({ ...EMPTY_JD }); setIsNew(true); setFormTab('base'); setError('') }}>
            ➕ Nuovo Job
          </button>
          <div className="toolbar-right">
            <span style={{ fontSize: 12, color: 'var(--color-muted)', alignSelf: 'center' }}>
              {rows.filter(r => r.enabled).length} attivi · {rows.length} totali
            </span>
          </div>
        </div>

        {/* Riepilogo per tipo */}
        <div className="stat-strip" style={{ marginBottom: 16 }}>
          <div className="stat-card" style={{ borderTop: '3px solid #6a1b9a' }}>
            <div className="stat-card-label">⏰ Schedulati</div>
            <div className="stat-card-value" style={{ color: '#6a1b9a' }}>
              {fmtN(rows.filter(r => r.jobType === 'SCHEDULED').length)}
            </div>
            <div className="stat-card-sub">
              {rows.filter(r => r.jobType === 'SCHEDULED' && r.enabled).length} attivi
            </div>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid #1565c0' }}>
            <div className="stat-card-label">📥 File-Driven</div>
            <div className="stat-card-value" style={{ color: '#1565c0' }}>
              {fmtN(rows.filter(r => r.jobType === 'FILE_DRIVEN').length)}
            </div>
            <div className="stat-card-sub">
              {rows.filter(r => r.jobType === 'FILE_DRIVEN' && r.enabled).length} attivi
            </div>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid #00695c' }}>
            <div className="stat-card-label">🪣 Output Bucket</div>
            <div className="stat-card-value" style={{ color: '#00695c' }}>
              {fmtN(rows.filter(r => r.outputMode === 'BUCKET_WRITE' || r.outputMode === 'BUCKET_AND_DATABASE').length)}
            </div>
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid #e65100' }}>
            <div className="stat-card-label">🗄 Output DB</div>
            <div className="stat-card-value" style={{ color: '#e65100' }}>
              {fmtN(rows.filter(r => r.outputMode === 'DATABASE_UPDATE' || r.outputMode === 'BUCKET_AND_DATABASE').length)}
            </div>
          </div>
        </div>

        <AdvancedSearch fields={SEARCH_FIELDS} value={crit} onChange={setCrit}
          totalCount={rows.length} filteredCount={filtered.length}
          title="Ricerca Job" />

        {loading && <div className="pvHint">Caricamento...</div>}

        <PartitaTable
          rows={filtered} columns={columns} getRowId={r => r.id ?? r.name}
          emptyMessage="Nessun job configurato. Crea il primo job con il pulsante ➕ Nuovo Job."
          renderDetail={r => (
            <>
              <div className="partitaDetailGrid">
                <Field label="NOME"          value={<strong>{r.name}</strong>} />
                <Field label="TIPO"          value={<PvBadge tone={r.jobType === 'SCHEDULED' ? 'purple' : 'blue'}>{JOB_TYPE_LABEL[r.jobType]}</PvBadge>} />
                <Field label="DESCRIZIONE"   value={r.description ?? '—'} wide />
                <Field label="CATEGORIA"     value={r.category ?? '—'} />
                <Field label="OWNER"         value={r.owner ?? '—'} />

                {r.jobType === 'SCHEDULED' && <>
                  <Field label="CRON"        value={<code>{r.cronExpression}</code>} />
                  <Field label="ORARIO"      value={cronToHuman(r.cronExpression ?? '')} />
                </>}

                {r.jobType === 'FILE_DRIVEN' && <>
                  <Field label="INPUT BUCKET" value={<code style={{ fontSize: 10 }}>{r.inputBucketUri}</code>} wide />
                  <Field label="FILE PATTERN" value={<code>{r.filePattern}</code>} />
                </>}

                <Field label="OUTPUT MODE"   value={r.outputMode ? <PvBadge tone="teal">{OUTPUT_MODE_LABEL[r.outputMode]}</PvBadge> : '—'} />
                {r.outputBucketUri && <Field label="OUTPUT BUCKET" value={<code style={{ fontSize: 10 }}>{r.outputBucketUri}</code>} wide />}
                {r.outputDbTarget  && <Field label="DB TARGET"     value={<code>{r.outputDbType} → {r.outputDbTarget} ({r.outputWriteMode})</code>} wide />}

                <Field label="SCRIPT SPARK"  value={r.sparkMainScript ? <code style={{ fontSize: 10 }}>{r.sparkMainScript}</code> : '—'} wide />
                <Field label="ARGS SPARK"    value={r.sparkArguments?.join(' ') ?? '—'} wide />
                <Field label="VERSIONE"      value={r.sparkVersion ?? '3.5'} />
                <Field label="MEMORIA"       value={r.executorMemory ?? '4g'} />
                <Field label="CORE"          value={String(r.executorCores ?? 2)} />
                <Field label="MAX CONCORR."  value={String(r.maxConcurrentRuns ?? 1)} />
                <Field label="TIMEOUT"       value={r.timeoutMinutes ? `${r.timeoutMinutes} min` : 'Default (120 min)'} />
                <Field label="MAX RETRY"     value={String(r.maxRetries ?? 0)} />
                <Field label="STATO"         value={<PvBadge tone={r.enabled ? 'green' : 'gray'}>{r.enabled ? 'Attivo' : 'Disabilitato'}</PvBadge>} />
                <Field label="TAG"           value={r.tags?.join(', ') ?? '—'} />
                <Field label="CREATO"        value={fmtDate(r.createdAt)} />
                <Field label="AGGIORNATO"    value={fmtDate(r.updatedAt)} />
              </div>
              <div className="jumpBar">
                {r.jobType === 'SCHEDULED' && r.enabled && (
                  <button onClick={() => handleRunNow(r.id!, r.name)}>▶ Avvia ora</button>
                )}
                <button onClick={() => navigate('/processi')}>🔍 Vedi esecuzioni</button>
                <button onClick={() => navigate('/nuova-elaborazione')}>➕ Avvia manuale</button>
              </div>
            </>
          )}
        />
      </div>

      {/* ── Drawer form ────────────────────────────────────────────────────── */}
      {editing && (
        <Drawer
          title={isNew ? '➕ Nuovo Job' : `✏️ Modifica — ${editing.name}`}
          onClose={() => { setEditing(null); setError('') }}>

          {/* Tab interni al drawer */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
            {([
              { id: 'base',      label: '1. Trigger' },
              { id: 'output',    label: '2. Output' },
              { id: 'dataproc',  label: '3. Dataproc' },
              { id: 'avanzate',  label: '4. Avanzate' },
            ] as { id: typeof formTab; label: string }[]).map(t => (
              <button key={t.id} onClick={() => setFormTab(t.id)}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'none',
                  border: 'none', cursor: 'pointer',
                  color: formTab === t.id ? 'var(--color-accent)' : '#888',
                  borderBottom: formTab === t.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                  marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab 1: Trigger ─────────────────────────────────────── */}
          {formTab === 'base' && (
            <div className="form-grid">
              <div className="form-field span2">
                <label>NOME JOB * (univoco, kebab-case)</label>
                <input value={editing.name}
                  onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))}
                  placeholder="report-vendite-giornaliero" />
              </div>
              <div className="form-field span2">
                <label>DESCRIZIONE</label>
                <input value={editing.description ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, description: e.target.value }))}
                  placeholder="Cosa fa questo job..." />
              </div>
              <div className="form-field">
                <label>TIPO JOB *</label>
                <select value={editing.jobType}
                  onChange={e => setEditing(p => ({ ...p!, jobType: e.target.value as JobType }))}>
                  <option value="SCHEDULED">⏰ Schedulato (cron)</option>
                  <option value="FILE_DRIVEN">📥 File-Driven (bucket)</option>
                </select>
              </div>
              <div className="form-field">
                <label>CATEGORIA</label>
                <select value={editing.category ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, category: e.target.value }))}>
                  <option value="">— seleziona —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {editing.jobType === 'SCHEDULED' && (
                <>
                  <div className="form-field span2">
                    <label>ORARIO PREDEFINITO</label>
                    <select onChange={e => { if (e.target.value) setEditing(p => ({ ...p!, cronExpression: e.target.value })) }}>
                      {CRON_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field span2">
                    <label>CRON EXPRESSION * (6 campi: sec min ora giornoMese mese giornoSett)</label>
                    <input value={editing.cronExpression ?? ''}
                      onChange={e => setEditing(p => ({ ...p!, cronExpression: e.target.value }))}
                      placeholder="0 0 2 * * ?" />
                    <span style={{ fontSize: 10, color: '#888', marginTop: 3, display: 'block' }}>
                      {editing.cronExpression ? cronToHuman(editing.cronExpression) : ''}
                    </span>
                  </div>
                </>
              )}

              {editing.jobType === 'FILE_DRIVEN' && (
                <>
                  <div className="form-field span2">
                    <label>BUCKET INPUT URI * (GCS: gs://... | S3: s3://...)</label>
                    <input value={editing.inputBucketUri ?? ''}
                      onChange={e => setEditing(p => ({ ...p!, inputBucketUri: e.target.value }))}
                      placeholder="gs://my-input-bucket/cartella/" />
                  </div>
                  <div className="form-field span2">
                    <label>FILE PATTERN (glob)</label>
                    <input value={editing.filePattern ?? ''}
                      onChange={e => setEditing(p => ({ ...p!, filePattern: e.target.value }))}
                      placeholder="*.parquet oppure data_*.csv" />
                  </div>
                </>
              )}

              <div className="form-field">
                <label>OWNER / TEAM</label>
                <input value={editing.owner ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, owner: e.target.value }))}
                  placeholder="team-analytics" />
              </div>
              <div className="form-field">
                <label>TAG (separati da virgola)</label>
                <input
                  value={editing.tags?.join(', ') ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                  placeholder="etl, daily, vendite" />
              </div>
            </div>
          )}

          {/* ── Tab 2: Output ──────────────────────────────────────── */}
          {formTab === 'output' && (
            <div className="form-grid">
              <div className="form-field span2">
                <label>MODALITÀ OUTPUT *</label>
                <select value={editing.outputMode ?? 'BUCKET_WRITE'}
                  onChange={e => setEditing(p => ({ ...p!, outputMode: e.target.value as OutputMode }))}>
                  <option value="BUCKET_WRITE">🪣 Scrive file su Bucket (GCS/S3)</option>
                  <option value="DATABASE_UPDATE">🗄 Aggiorna Database (BigQuery, PG, MongoDB…)</option>
                  <option value="BUCKET_AND_DATABASE">🪣🗄 Scrive su Bucket E aggiorna Database</option>
                </select>
              </div>

              {(editing.outputMode === 'BUCKET_WRITE' || editing.outputMode === 'BUCKET_AND_DATABASE') && (
                <div className="form-field span2">
                  <label>OUTPUT BUCKET URI</label>
                  <input value={editing.outputBucketUri ?? ''}
                    onChange={e => setEditing(p => ({ ...p!, outputBucketUri: e.target.value }))}
                    placeholder="gs://my-output-bucket/reports/" />
                </div>
              )}

              {(editing.outputMode === 'DATABASE_UPDATE' || editing.outputMode === 'BUCKET_AND_DATABASE') && (
                <>
                  <div className="form-field">
                    <label>TIPO DATABASE</label>
                    <select value={editing.outputDbType ?? 'BigQuery'}
                      onChange={e => setEditing(p => ({ ...p!, outputDbType: e.target.value }))}>
                      {DB_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>WRITE MODE</label>
                    <select value={editing.outputWriteMode ?? 'APPEND'}
                      onChange={e => setEditing(p => ({ ...p!, outputWriteMode: e.target.value }))}>
                      {WRITE_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-field span2">
                    <label>DATASET / TABELLA TARGET</label>
                    <input value={editing.outputDbTarget ?? ''}
                      onChange={e => setEditing(p => ({ ...p!, outputDbTarget: e.target.value }))}
                      placeholder="analytics.daily_sales  oppure  public.orders" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Tab 3: Dataproc ────────────────────────────────────── */}
          {formTab === 'dataproc' && (
            <div className="form-grid">
              <div className="form-field">
                <label>GCP PROJECT ID</label>
                <input value={editing.gcpProjectId ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, gcpProjectId: e.target.value }))}
                  placeholder="my-gcp-project" />
              </div>
              <div className="form-field">
                <label>GCP REGION</label>
                <input value={editing.gcpRegion ?? 'europe-west1'}
                  onChange={e => setEditing(p => ({ ...p!, gcpRegion: e.target.value }))}
                  placeholder="europe-west1" />
              </div>
              <div className="form-field span2">
                <label>SCRIPT PYSPARK (URI GCS)</label>
                <input value={editing.sparkMainScript ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, sparkMainScript: e.target.value }))}
                  placeholder="gs://my-scripts-bucket/jobs/my_job.py" />
              </div>
              <div className="form-field span2">
                <label>ARGOMENTI SPARK (uno per riga — usa {'{'} placeholder {'}'} )</label>
                <textarea rows={4}
                  value={editing.sparkArguments?.join('\n') ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, sparkArguments: e.target.value.split('\n').filter(Boolean) }))}
                  placeholder={'--output={outputBucketUri}\n--date={date}\n--input={inputFile}'}
                  style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
                <span style={{ fontSize: 10, color: '#888', marginTop: 3, display: 'block' }}>
                  Placeholder: {'{date}'} {'{inputFile}'} {'{outputBucketUri}'} {'{outputDbTarget}'}
                </span>
              </div>
              <div className="form-field">
                <label>VERSIONE SPARK</label>
                <input value={editing.sparkVersion ?? '3.5'}
                  onChange={e => setEditing(p => ({ ...p!, sparkVersion: e.target.value }))}
                  placeholder="3.5" />
              </div>
              <div className="form-field">
                <label>MEMORIA EXECUTOR</label>
                <input value={editing.executorMemory ?? '4g'}
                  onChange={e => setEditing(p => ({ ...p!, executorMemory: e.target.value }))}
                  placeholder="4g" />
              </div>
              <div className="form-field">
                <label>CORE EXECUTOR</label>
                <input type="number" value={editing.executorCores ?? 2}
                  onChange={e => setEditing(p => ({ ...p!, executorCores: parseInt(e.target.value) || 2 }))} />
              </div>
            </div>
          )}

          {/* ── Tab 4: Avanzate ────────────────────────────────────── */}
          {formTab === 'avanzate' && (
            <div className="form-grid">
              <div className="form-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="jobEnabled" checked={editing.enabled ?? true}
                  onChange={e => setEditing(p => ({ ...p!, enabled: e.target.checked }))} />
                <label htmlFor="jobEnabled" style={{ textTransform: 'none', fontSize: 13, fontWeight: 400 }}>
                  Job abilitato (trigger attivo)
                </label>
              </div>
              <div className="form-field">
                <label>MAX ESECUZIONI CONCORRENTI</label>
                <input type="number" value={editing.maxConcurrentRuns ?? 1}
                  onChange={e => setEditing(p => ({ ...p!, maxConcurrentRuns: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="form-field">
                <label>TIMEOUT (minuti, vuoto = default 120)</label>
                <input type="number" value={editing.timeoutMinutes ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, timeoutMinutes: e.target.value ? parseInt(e.target.value) : undefined }))} />
              </div>
              <div className="form-field">
                <label>MAX RETRY AUTOMATICI</label>
                <input type="number" value={editing.maxRetries ?? 0}
                  onChange={e => setEditing(p => ({ ...p!, maxRetries: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="form-field">
                <label>ATTESA TRA RETRY (minuti)</label>
                <input type="number" value={editing.retryDelayMinutes ?? 5}
                  onChange={e => setEditing(p => ({ ...p!, retryDelayMinutes: parseInt(e.target.value) || 5 }))} />
              </div>
              <div className="form-field span2">
                <label>EMAIL ALERT (separate da virgola)</label>
                <input value={editing.alertEmails?.join(', ') ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, alertEmails: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                  placeholder="ops@company.com, team-data@company.com" />
              </div>
              <div className="form-field span2">
                <label>WEBHOOK (Slack / Teams)</label>
                <input value={editing.webhookUrl ?? ''}
                  onChange={e => setEditing(p => ({ ...p!, webhookUrl: e.target.value }))}
                  placeholder="https://hooks.slack.com/services/..." />
              </div>
            </div>
          )}

          {error && <div className="pvError" style={{ marginTop: 12 }}>{error}</div>}

          <div className="form-actions">
            {formTab !== 'base' && (
              <button className="secondary" onClick={() => setFormTab(
                formTab === 'output' ? 'base' : formTab === 'dataproc' ? 'output' : 'dataproc'
              )}>← Indietro</button>
            )}
            {formTab !== 'avanzate' && (
              <button className="secondary" onClick={() => setFormTab(
                formTab === 'base' ? 'output' : formTab === 'output' ? 'dataproc' : 'avanzate'
              )}>Avanti →</button>
            )}
            <button className="secondary" onClick={() => { setEditing(null); setError('') }} disabled={saving}>
              Annulla
            </button>
            <button className="primary" onClick={save} disabled={saving}>
              {saving ? '⏳ Salvataggio...' : '💾 Salva Job'}
            </button>
          </div>
        </Drawer>
      )}

      {/* Modal conferma eliminazione */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1400,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 28, maxWidth: 380,
            boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🗑</div>
            <h3 style={{ margin: '0 0 8px' }}>Elimina Job Definition?</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--color-muted)', fontSize: 13 }}>
              Il job non verrà più avviato. Le esecuzioni già registrate rimarranno nell'Inquiry Processi.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="secondary" onClick={() => setConfirmDel(null)}>Annulla</button>
              <button className="danger-btn" onClick={() => handleDelete(confirmDel)}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper: traduzione cron in linguaggio naturale ────────────────────────────

function cronToHuman(cron: string): string {
  if (!cron) return ''
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 6) return 'Espressione non valida'
  const [, min, hour, dom, , dow] = parts
  try {
    const hourStr = hour.includes(',') ? `alle ${hour.replace(/,/g, ':00, ')}:00`
                  : hour === '*'       ? 'ogni ora'
                  : hour.startsWith('*/') ? `ogni ${hour.split('/')[1]} ore`
                  : `alle ${hour.padStart(2,'0')}:${min === '*' ? '00' : min.padStart(2,'0')}`
    const dayStr  = dow === '?' || dow === '*' ? 'ogni giorno'
                  : dow === '1-5' ? 'Lun–Ven'
                  : `giorno settimana ${dow}`
    const domStr  = dom !== '?' && dom !== '*' ? ` il giorno ${dom}` : ''
    return `${dayStr}${domStr} ${hourStr}`
  } catch { return cron }
}
