import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PvBadge, Drawer, Field, fmtDate } from '../components/DesignSystem'
import { AdvancedSearch, matchAdvanced, type FieldDef, type Criteria } from '../components/AdvancedSearch'
import { PartitaTable, type ColumnConfig } from '../components/PartitaTable'
import {
  getBucketConfigs, createBucketConfig, updateBucketConfig,
  deleteBucketConfig, type BucketConfig,
} from '../api/pvClient'

const SEARCH_FIELDS: FieldDef[] = [
  { key: 'name',        label: 'NOME',         type: 'text' },
  { key: 'bucketUri',   label: 'BUCKET URI',   type: 'text' },
  { key: 'storageType', label: 'STORAGE TYPE', type: 'select',
    options: [{ value: 'GCS', label: 'GCS' }, { value: 'S3', label: 'S3' }] },
]

const EMPTY: Partial<BucketConfig> = {
  name: '', bucketUri: '', storageType: 'GCS',
  gcpProjectId: '', gcpRegion: 'europe-west1',
  filePattern: '*.parquet', triggerEnabled: true, maxConcurrentJobs: 5, description: '',
}

export function BucketConfigPage() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState<BucketConfig[]>([])
  const [crit, setCrit]       = useState<Criteria>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<BucketConfig> | null>(null)
  const [isNew, setIsNew]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [notice, setNotice]   = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    getBucketConfigs()
      .then(d => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => rows.filter(r => matchAdvanced(r as unknown as Record<string, unknown>, crit)),
    [rows, crit]
  )

  async function save() {
    if (!editing) return
    if (!editing.name?.trim() || !editing.bucketUri?.trim()) {
      setError('Nome e Bucket URI sono obbligatori')
      return
    }
    setSaving(true); setError('')
    try {
      if (isNew) {
        const c = await createBucketConfig(editing)
        setRows(rs => [c, ...rs])
        setNotice(`✅ Configurazione "${c.name}" creata`)
      } else {
        const u = await updateBucketConfig(editing.id!, editing)
        setRows(rs => rs.map(r => r.id === editing.id ? u : r))
        setNotice(`✅ Configurazione "${u.name}" aggiornata`)
      }
      setEditing(null)
    } catch (e) {
      setError('Errore salvataggio: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteBucketConfig(id)
      setRows(rs => rs.filter(r => r.id !== id))
      setNotice('🗑 Configurazione eliminata')
      setConfirmDel(null)
    } catch (e) {
      setError('Errore eliminazione: ' + String(e))
    }
  }

  const FIELD_DEFS = [
    { k: 'name',                  l: 'NOME *',              span: true },
    { k: 'bucketUri',             l: 'BUCKET URI *',        span: true },
    { k: 'dataprocBatchTemplate', l: 'TEMPLATE DATAPROC',   span: true },
    { k: 'gcpProjectId',          l: 'GCP PROJECT ID' },
    { k: 'gcpRegion',             l: 'GCP REGION' },
    { k: 'filePattern',           l: 'FILE PATTERN' },
    { k: 'maxConcurrentJobs',     l: 'MAX JOB CONCORRENTI', type: 'number' },
    { k: 'description',           l: 'DESCRIZIONE',         span: true },
  ]

  const columns: ColumnConfig<BucketConfig>[] = [
    {
      key: 'name', label: 'NOME', flex: 1.2, sortValue: r => r.name,
      render: r => <strong style={{ fontSize: 12 }}>{r.name}</strong>,
    },
    {
      key: 'bucketUri', label: 'BUCKET URI', flex: 2,
      render: r => <code style={{ fontSize: 10, color: '#555' }}>{r.bucketUri}</code>,
    },
    {
      key: 'storageType', label: 'TIPO', flex: 0.5,
      render: r => <PvBadge tone={r.storageType === 'GCS' ? 'blue' : 'orange'}>{r.storageType}</PvBadge>,
    },
    {
      key: 'filePattern', label: 'PATTERN', flex: 0.8,
      render: r => <code style={{ fontSize: 10 }}>{r.filePattern ?? '—'}</code>,
    },
    {
      key: 'maxConcurrentJobs', label: 'MAX', flex: 0.4, align: 'right',
      render: r => <span style={{ fontSize: 11 }}>{r.maxConcurrentJobs}</span>,
    },
    {
      key: 'triggerEnabled', label: 'TRIGGER', flex: 0.7,
      render: r => <PvBadge tone={r.triggerEnabled ? 'green' : 'gray'}>
        {r.triggerEnabled ? '✅ Attivo' : '⏸ Pausa'}
      </PvBadge>,
    },
    {
      key: 'act', label: 'AZIONI', flex: 0.7,
      render: r => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={e => { e.stopPropagation(); setEditing({ ...r }); setIsNew(false) }}
            style={{ fontSize: 11, padding: '2px 8px', background: 'var(--color-accent)', color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            ✏️
          </button>
          <button onClick={e => { e.stopPropagation(); navigate('/nuova-elaborazione') }}
            title="Avvia elaborazione"
            style={{ fontSize: 11, padding: '2px 8px', background: '#e8f5e9', color: '#1b5e20',
              border: '1px solid #a5d6a7', borderRadius: 4, cursor: 'pointer' }}>
            ▶
          </button>
          <button onClick={e => { e.stopPropagation(); setConfirmDel(r.id) }}
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
        <h1 className="page-title">🗂 Configurazioni Bucket</h1>
        <p className="page-sub">Gestisci i bucket GCS/S3 monitorati e i parametri Dataproc associati</p>
      </div>

      <div className="pvPage">
        {error  && <div className="pvError">{error}</div>}
        {notice && <div className="pvSuccess">{notice}</div>}

        <div className="toolbar">
          <button className="primary" onClick={() => { setEditing({ ...EMPTY }); setIsNew(true); setError('') }}>
            ➕ Nuova Configurazione
          </button>
          <div className="toolbar-right">
            <span style={{ fontSize: 12, color: 'var(--color-muted)', alignSelf: 'center' }}>
              {rows.length} configurazioni
            </span>
          </div>
        </div>

        <AdvancedSearch fields={SEARCH_FIELDS} value={crit} onChange={setCrit}
          totalCount={rows.length} filteredCount={filtered.length}
          title="Ricerca Configurazioni Bucket" />

        {loading && <div className="pvHint">Caricamento...</div>}

        <PartitaTable
          rows={filtered} columns={columns} getRowId={r => r.id}
          emptyMessage="Nessuna configurazione trovata. Crea la prima configurazione bucket."
          renderDetail={r => (
            <>
              <div className="partitaDetailGrid">
                <Field label="NOME"             value={r.name} />
                <Field label="BUCKET URI"       value={<code style={{ fontSize: 10 }}>{r.bucketUri}</code>} wide />
                <Field label="STORAGE TYPE"     value={<PvBadge tone={r.storageType === 'GCS' ? 'blue' : 'orange'}>{r.storageType}</PvBadge>} />
                <Field label="GCP PROJECT"      value={<code>{r.gcpProjectId ?? '—'}</code>} />
                <Field label="GCP REGION"       value={<code>{r.gcpRegion ?? '—'}</code>} />
                <Field label="FILE PATTERN"     value={<code>{r.filePattern ?? '—'}</code>} />
                <Field label="TRIGGER"          value={<PvBadge tone={r.triggerEnabled ? 'green' : 'gray'}>{r.triggerEnabled ? 'Attivo' : 'Disabilitato'}</PvBadge>} />
                <Field label="MAX CONCURRENT"   value={r.maxConcurrentJobs} />
                <Field label="TEMPLATE"         value={r.dataprocBatchTemplate ? <code style={{ fontSize: 9, wordBreak: 'break-all' }}>{r.dataprocBatchTemplate}</code> : '—'} wide />
                <Field label="DESCRIZIONE"      value={r.description ?? '—'} wide />
                <Field label="CREATO"           value={fmtDate(r.createdAt)} />
                <Field label="AGGIORNATO"       value={fmtDate(r.updatedAt)} />
              </div>
              <div className="jumpBar">
                <button onClick={() => navigate('/nuova-elaborazione')}>▶ Avvia elaborazione</button>
                <button onClick={() => navigate('/processi')}>🔍 Vedi processi</button>
              </div>
            </>
          )}
        />
      </div>

      {/* Drawer edit */}
      {editing && (
        <Drawer
          title={isNew ? '➕ Nuova Configurazione Bucket' : `✏️ Modifica — ${editing.name}`}
          onClose={() => { setEditing(null); setError('') }}>
          <div className="form-grid">
            {FIELD_DEFS.map(f => (
              <div key={f.k} className={`form-field${f.span ? ' span2' : ''}`}>
                <label>{f.l}</label>
                <input
                  type={f.type ?? 'text'}
                  value={(editing as unknown as Record<string, unknown>)[f.k] as string ?? ''}
                  onChange={e => setEditing(p => ({
                    ...p!,
                    [f.k]: f.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value,
                  }))}
                />
              </div>
            ))}
            <div className="form-field">
              <label>STORAGE TYPE</label>
              <select value={editing.storageType ?? 'GCS'}
                onChange={e => setEditing(p => ({ ...p!, storageType: e.target.value }))}>
                <option value="GCS">Google Cloud Storage</option>
                <option value="S3">Amazon S3</option>
              </select>
            </div>
            <div className="form-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="triggerEn" checked={editing.triggerEnabled ?? true}
                onChange={e => setEditing(p => ({ ...p!, triggerEnabled: e.target.checked }))} />
              <label htmlFor="triggerEn" style={{ textTransform: 'none', fontSize: 13, fontWeight: 400 }}>
                Trigger automatico abilitato
              </label>
            </div>
          </div>
          {error && <div className="pvError" style={{ marginTop: 12 }}>{error}</div>}
          <div className="form-actions">
            <button className="secondary" onClick={() => { setEditing(null); setError('') }} disabled={saving}>
              Annulla
            </button>
            <button className="primary" onClick={save} disabled={saving}>
              {saving ? '⏳ Salvataggio...' : '💾 Salva'}
            </button>
          </div>
        </Drawer>
      )}

      {/* Modal conferma eliminazione */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1400,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 28,
            maxWidth: 380, boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🗑</div>
            <h3 style={{ margin: '0 0 8px' }}>Elimina configurazione?</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--color-muted)', fontSize: 13 }}>
              Questa azione non può essere annullata. I processi esistenti non saranno eliminati.
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
