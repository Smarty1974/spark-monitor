import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { StateBadge, Field, fmtDate, fmtN } from '../components/DesignSystem'
import { AdvancedSearch, matchAdvanced, type FieldDef, type Criteria } from '../components/AdvancedSearch'
import { PartitaTable, type ColumnConfig } from '../components/PartitaTable'
import { StateMachineDiagram } from '../components/StateMachineDiagram'
import {
  getBatchProcesses, resubmitProcess, exportCsv, type BatchProcess,
} from '../api/pvClient'
import type { BatchState } from '../components/DesignSystem'

const STATE_COLORS: Record<string, string> = {
  FILE_RECEIVED: '#1565c0', SPARK_SUBMITTED: '#e65100', COMPLETED: '#1b5e20', FAILED: '#b71c1c',
}

const SEARCH_FIELDS: FieldDef[] = [
  { key: 'fileName',   label: 'NOME FILE',      type: 'text',   placeholder: 'data_*.parquet' },
  { key: 'bucketUri',  label: 'BUCKET URI',     type: 'text',   placeholder: 'gs://...' },
  { key: 'state',      label: 'STATO',          type: 'select',
    options: ['FILE_RECEIVED', 'SPARK_SUBMITTED', 'COMPLETED', 'FAILED'].map(v => ({ value: v, label: v })) },
  { key: 'sparkJobId', label: 'SPARK JOB ID',   type: 'text' },
  { key: 'createdAt',  label: 'DATA CREAZIONE', type: 'date' },
]

function HistoryTimeline({ history }: { history: { timestamp?: string; fromState?: string; toState: string; message?: string }[] }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 2, background: '#e0e0e0' }} />
      {history.map((h, i) => (
        <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
          <div style={{
            position: 'absolute', left: -20, top: 2, width: 10, height: 10,
            borderRadius: '50%', background: STATE_COLORS[h.toState] ?? '#aaa',
            border: '2px solid #fff', boxShadow: `0 0 0 2px ${STATE_COLORS[h.toState] ?? '#aaa'}`,
          }} />
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{fmtDate(h.timestamp)}</div>
          <div style={{ fontSize: 12 }}>
            {h.fromState && <span style={{ color: '#888' }}>{h.fromState} → </span>}
            <strong style={{ color: STATE_COLORS[h.toState] ?? '#333' }}>{h.toState}</strong>
          </div>
          {h.message && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{h.message}</div>}
        </div>
      ))}
    </div>
  )
}

export function InquiryProcessi() {
  const navigate = useNavigate()
  const [rows, setRows]             = useState<BatchProcess[]>([])
  const [criteria, setCriteria]     = useState<Criteria>({})
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState('')
  const [notice, setNotice]         = useState('')
  const [showDiagram, setShowDiagram] = useState(false)
  const [activeState, setActiveState] = useState<BatchState | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [selected, setSelected]     = useState<Set<string>>(new Set())

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    getBatchProcesses()
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(e => setError(String(e)))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh ogni 30s se abilitato
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => load(true), 30000)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  const filtered = useMemo(
    () => rows.filter(r => matchAdvanced(r as unknown as Record<string, unknown>, criteria)),
    [rows, criteria]
  )

  // Stat per le stat-card
  const counts = useMemo(() => ({
    all:       rows.length,
    received:  rows.filter(r => r.state === 'FILE_RECEIVED').length,
    submitted: rows.filter(r => r.state === 'SPARK_SUBMITTED').length,
    completed: rows.filter(r => r.state === 'COMPLETED').length,
    failed:    rows.filter(r => r.state === 'FAILED').length,
  }), [rows])

  function filterByState(s: string | null) {
    setActiveState(s as BatchState | null)
    setCriteria(s ? { state: { op: 'eq', v: s } } : {})
    setSelected(new Set())
  }

  async function handleResubmit(id: string, fileName: string) {
    try {
      await resubmitProcess(id)
      setNotice(`↩ Resubmit di "${fileName}" avviato`)
      load(true)
    } catch (e) {
      setError('Errore resubmit: ' + String(e))
    }
  }

  async function handleBulkResubmit() {
    const targets = rows.filter(r => selected.has(r.id) && r.state === 'FAILED')
    if (targets.length === 0) { setError('Nessun job FAILED selezionato'); return }
    setNotice('')
    let ok = 0
    for (const t of targets) {
      try { await resubmitProcess(t.id); ok++ } catch { /* skip */ }
    }
    setNotice(`↩ ${ok} resubmit avviati`)
    setSelected(new Set())
    load(true)
  }

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(r => r.id)))
  }

  const columns: ColumnConfig<BatchProcess>[] = [
    {
      key: 'sel', label: '',
      render: r => (
        <input type="checkbox" checked={selected.has(r.id)}
          onChange={() => toggleSelect(r.id)}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer' }} />
      ),
    },
    {
      key: 'fileName', label: 'FILE', flex: 2,
      sortValue: r => r.fileName,
      render: r => (
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#1565c0' }}>
            {r.fileName}
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>{r.bucketUri}</div>
        </div>
      ),
    },
    {
      key: 'state', label: 'STATO', flex: 1,
      sortValue: r => r.state,
      render: r => <StateBadge state={r.state} />,
    },
    {
      key: 'sparkJobId', label: 'JOB ID', flex: 1,
      render: r => r.sparkJobId
        ? <code style={{ fontSize: 10, color: '#555' }}>{r.sparkJobId}</code>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      key: 'fileSizeBytes', label: 'DIM.', flex: 0.6, align: 'right',
      sortValue: r => r.fileSizeBytes ?? 0,
      render: r => r.fileSizeBytes
        ? <span style={{ fontSize: 11 }}>{(r.fileSizeBytes / 1024).toFixed(0)} KB</span>
        : '—',
    },
    {
      key: 'createdAt', label: 'CREATO', flex: 1,
      sortValue: r => r.createdAt ?? '',
      render: r => <code style={{ fontSize: 10 }}>{fmtDate(r.createdAt)}</code>,
    },
    {
      key: 'updatedAt', label: 'AGGIORN.', flex: 1,
      sortValue: r => r.updatedAt ?? '',
      render: r => <code style={{ fontSize: 10 }}>{fmtDate(r.updatedAt)}</code>,
    },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🔍 Inquiry Processi</h1>
        <p className="page-sub">Monitoraggio in tempo reale dei job batch Spark</p>
      </div>

      <div className="pvPage">
        {error   && <div className="pvError">{error}<button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}
        {notice  && <div className="pvSuccess">{notice}<button onClick={() => setNotice('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

        {/* Stat cards con filtro rapido */}
        <div className="stat-strip">
          {[
            { key: null,              label: 'Tutti',         value: counts.all,       color: '#555' },
            { key: 'FILE_RECEIVED',   label: 'In attesa',     value: counts.received,  color: STATE_COLORS.FILE_RECEIVED },
            { key: 'SPARK_SUBMITTED', label: 'In esecuzione', value: counts.submitted, color: STATE_COLORS.SPARK_SUBMITTED },
            { key: 'COMPLETED',       label: 'Completati',    value: counts.completed, color: STATE_COLORS.COMPLETED },
            { key: 'FAILED',          label: 'Falliti',       value: counts.failed,    color: STATE_COLORS.FAILED },
          ].map(({ key, label, value, color }) => (
            <div key={label}
              className={`stat-card ${activeState === key ? 'active' : ''}`}
              onClick={() => filterByState(key)}
              style={{ borderTop: `3px solid ${color}`, cursor: 'pointer' }}>
              <div className="stat-card-label">{label}</div>
              <div className="stat-card-value" style={{ color }}>{fmtN(value)}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <button className="primary" onClick={() => navigate('/nuova-elaborazione')}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            ➕ Nuova
          </button>
          <button className="secondary" onClick={() => load(true)}
            style={{ fontSize: 12, padding: '6px 12px' }}>
            {refreshing ? <span className="spin">↻</span> : '↻'} Aggiorna
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh 30s
          </label>

          <div className="toolbar-right">
            {selected.size > 0 && (
              <>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', alignSelf: 'center' }}>
                  {selected.size} selezionati
                </span>
                <button className="secondary" onClick={handleBulkResubmit}
                  style={{ fontSize: 12, padding: '6px 12px' }}>
                  ↩ Resubmit selezionati
                </button>
              </>
            )}
            <button className="icon-btn" onClick={() => exportCsv(filtered, 'processi.csv')}
              title="Esporta CSV">
              ⬇ CSV
            </button>
            <button className="icon-btn" onClick={() => setShowDiagram(d => !d)}
              title="Mostra/nascondi state machine">
              📊
            </button>
          </div>
        </div>

        {/* State machine diagram */}
        {showDiagram && (
          <div style={{ marginBottom: 16 }}>
            <StateMachineDiagram
              activeState={activeState}
              onStateClick={s => filterByState(s === activeState ? null : s)}
            />
          </div>
        )}

        {/* Selezione totale */}
        {filtered.length > 0 && (
          <div style={{ marginBottom: 8, fontSize: 12 }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll} />
              Seleziona tutti ({filtered.length})
            </label>
          </div>
        )}

        <AdvancedSearch
          fields={SEARCH_FIELDS} value={criteria} onChange={v => { setCriteria(v); setActiveState(null) }}
          totalCount={rows.length} filteredCount={filtered.length}
          title="Ricerca Processi Batch"
        />

        {loading && <div className="pvHint">Caricamento...</div>}

        <PartitaTable
          rows={filtered}
          columns={columns}
          getRowId={r => r.id}
          emptyMessage="Nessun processo trovato."
          renderDetail={r => (
            <>
              <div className="partitaDetailGrid">
                <Field label="PROCESS ID"     value={<code style={{ fontSize: 10 }}>{r.id}</code>} wide />
                <Field label="FILE NAME"      value={<code>{r.fileName}</code>} />
                <Field label="BUCKET URI"     value={<code style={{ fontSize: 10 }}>{r.bucketUri}</code>} />
                <Field label="STATO"          value={<StateBadge state={r.state} />} />
                <Field label="BATCH RESOURCE" wide value={
                  r.batchResourceName
                    ? <code style={{ fontSize: 9, wordBreak: 'break-all' }}>{r.batchResourceName}</code>
                    : <span style={{ color: '#ccc' }}>—</span>
                } />
                <Field label="SPARK JOB ID"   value={r.sparkJobId ? <code>{r.sparkJobId}</code> : '—'} />
                <Field label="DIMENSIONE"     value={r.fileSizeBytes ? `${(r.fileSizeBytes / 1024).toFixed(1)} KB` : '—'} />
                <Field label="CREATO"         value={fmtDate(r.createdAt)} />
                <Field label="AGGIORNATO"     value={fmtDate(r.updatedAt)} />
                {r.errorMessage && (
                  <div style={{ gridColumn: '1 / -1', background: '#ffebee', border: '1px solid #ef9a9a',
                    borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b71c1c', marginBottom: 4 }}>❌ ERRORE</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#555', wordBreak: 'break-all' }}>
                      {r.errorMessage}
                    </div>
                  </div>
                )}
              </div>

              {r.history && r.history.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '.05em',
                    textTransform: 'uppercase', marginBottom: 10 }}>
                    STORIA TRANSIZIONI ({r.history.length})
                  </div>
                  <HistoryTimeline history={r.history} />
                </div>
              )}

              <div className="jumpBar">
                {r.state === 'FAILED' && (
                  <button onClick={() => handleResubmit(r.id, r.fileName)}>↩ Resubmit</button>
                )}
                {(r.state === 'FILE_RECEIVED' || r.state === 'FAILED') && (
                  <button onClick={() => navigate(`/nuova-elaborazione`)}>➕ Nuova elaborazione</button>
                )}
                <button onClick={() => navigate('/statistiche')} style={{ marginLeft: 'auto' }}>
                  📈 Vai alle statistiche
                </button>
              </div>
            </>
          )}
        />
      </div>
    </div>
  )
}
