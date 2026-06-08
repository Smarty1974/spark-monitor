import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MetricTile, StateBadge, fmtN, fmtPct, fmtDate } from '../components/DesignSystem'
import { StateMachineDiagram } from '../components/StateMachineDiagram'
import { getBatchStats, getBatchProcesses, type BatchStats, type BatchProcess } from '../api/pvClient'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const PIE_COLORS: Record<string, string> = {
  FILE_RECEIVED: '#1565c0', SPARK_SUBMITTED: '#e65100', COMPLETED: '#1b5e20', FAILED: '#b71c1c',
}

const QUICK = [
  { label: '➕ Nuova Elaborazione', sub: 'Avvia un job batch manualmente',         path: '/nuova-elaborazione', color: 'var(--color-accent)' },
  { label: '🔍 Inquiry Processi',    sub: 'Monitora e analizza i batch',            path: '/processi',           color: '#1251a3' },
  { label: '🗂 Config Bucket',       sub: 'Gestisci bucket GCS/S3',                path: '/bucket-configs',     color: '#00695c' },
  { label: '⚙️ Scheduler',           sub: 'Controlla il polling scheduler',         path: '/simulatore',         color: 'var(--color-warning)' },
  { label: '📈 Statistiche',         sub: 'Grafici e analisi delle elaborazioni',   path: '/statistiche',        color: '#6a1b9a' },
]

export function SbmDashboard() {
  const [stats, setStats]   = useState<BatchStats | null>(null)
  const [recent, setRecent] = useState<BatchProcess[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    getBatchStats().then(setStats).catch(() => {})
    getBatchProcesses(0, 5).then(d => setRecent(Array.isArray(d) ? d.slice(0, 5) : []))
  }, [])

  const k = stats ?? { total: 0, fileReceived: 0, sparkSubmitted: 0, completed: 0, failed: 0, successRate: 0 }

  const pieData = [
    { name: 'File Ricevuto',  value: k.fileReceived,   state: 'FILE_RECEIVED' },
    { name: 'Spark Avviato',  value: k.sparkSubmitted, state: 'SPARK_SUBMITTED' },
    { name: 'Completato',     value: k.completed,      state: 'COMPLETED' },
    { name: 'Fallito',        value: k.failed,         state: 'FAILED' },
  ].filter(d => d.value > 0)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📊 Dashboard</h1>
        <p className="page-sub">Panoramica in tempo reale dei job Spark su GCP Dataproc Serverless</p>
      </div>

      <div className="pvPage">
        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          <MetricTile label="Processi totali" value={stats ? fmtN(k.total)         : '…'} sub="tutti gli stati"    tone="gray" />
          <MetricTile label="In esecuzione"   value={stats ? fmtN(k.sparkSubmitted) : '…'} sub="SPARK_SUBMITTED"   tone="orange" />
          <MetricTile label="Completati"      value={stats ? fmtN(k.completed)      : '…'} sub="con successo"      tone="green" />
          <MetricTile label="Success Rate"    value={stats ? fmtPct(k.successRate)  : '…'} sub="completati/totale" tone="blue" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Pie */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Distribuzione stati</h3>
            {k.total === 0
              ? <div style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 40, fontStyle: 'italic' }}>
                  Nessun processo ancora.<br />
                  <button className="primary" onClick={() => navigate('/nuova-elaborazione')}
                    style={{ marginTop: 12, fontSize: 12 }}>
                    ➕ Crea la prima elaborazione
                  </button>
                </div>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value"
                      label={({ name, value }: { name: string; value: number }) => `${value}`}
                      labelLine={false}>
                      {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[e.state] ?? '#ccc'} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmtN(v), 'Processi']}
                      labelFormatter={(l: string) => pieData.find(d => d.name === l)?.name ?? l} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>

          {/* Navigazione rapida */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Accesso rapido</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {QUICK.map(q => (
                <button key={q.path} onClick={() => navigate(q.path)}
                  style={{ padding: '10px 14px', background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
                    cursor: 'pointer', textAlign: 'left', borderLeft: `4px solid ${q.color}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: q.color }}>{q.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{q.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* State machine */}
        <div style={{ marginBottom: 24 }}>
          <StateMachineDiagram />
        </div>

        {/* Ultimi processi */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Ultimi processi</h3>
            <button onClick={() => navigate('/processi')}
              style={{ fontSize: 12, color: 'var(--color-accent)', background: 'none',
                border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Vedi tutti →
            </button>
          </div>
          {recent.length === 0
            ? <div style={{ color: 'var(--color-muted)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: 24 }}>
                Nessun processo recente
              </div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)' }}>
                    {['File', 'Stato', 'Bucket', 'Creato'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10,
                        fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)', cursor: 'pointer' }}
                      onClick={() => navigate('/processi')}>
                      <td style={{ padding: '6px 10px' }}>
                        <code style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{r.fileName}</code>
                      </td>
                      <td style={{ padding: '6px 10px' }}><StateBadge state={r.state} /></td>
                      <td style={{ padding: '6px 10px' }}>
                        <code style={{ fontSize: 9, color: 'var(--color-muted)' }}>{r.bucketUri}</code>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <code style={{ fontSize: 10, color: 'var(--color-muted)' }}>{fmtDate(r.createdAt)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}
