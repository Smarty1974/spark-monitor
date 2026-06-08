import { useState, useEffect } from 'react'
import { getBatchStats, getBatchProcesses, type BatchStats, type BatchProcess } from '../api/pvClient'
import { fmtDate, fmtN, fmtPct } from '../components/DesignSystem'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts'

const STATE_COLORS: Record<string, string> = {
  FILE_RECEIVED: '#1565c0', SPARK_SUBMITTED: '#e65100', COMPLETED: '#1b5e20', FAILED: '#b71c1c',
}

function groupByHour(processes: BatchProcess[]): { hour: string; completed: number; failed: number; submitted: number }[] {
  const map: Record<string, { completed: number; failed: number; submitted: number }> = {}
  processes.forEach(p => {
    if (!p.createdAt) return
    const h = p.createdAt.slice(0, 13) + ':00'
    if (!map[h]) map[h] = { completed: 0, failed: 0, submitted: 0 }
    if (p.state === 'COMPLETED')       map[h].completed++
    else if (p.state === 'FAILED')     map[h].failed++
    else if (p.state === 'SPARK_SUBMITTED') map[h].submitted++
  })
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([hour, v]) => ({ hour: hour.slice(11, 16), ...v }))
}

function groupByBucket(processes: BatchProcess[]): { bucket: string; count: number }[] {
  const map: Record<string, number> = {}
  processes.forEach(p => {
    const key = p.bucketUri ?? 'sconosciuto'
    map[key] = (map[key] ?? 0) + 1
  })
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([bucket, count]) => ({ bucket: bucket.replace('gs://', '').replace('s3://', ''), count }))
}

function avgDuration(processes: BatchProcess[]): string {
  const completed = processes.filter(p => p.state === 'COMPLETED' && p.createdAt && p.updatedAt)
  if (completed.length === 0) return '—'
  const total = completed.reduce((sum, p) => {
    const ms = new Date(p.updatedAt!).getTime() - new Date(p.createdAt!).getTime()
    return sum + ms
  }, 0)
  const avgMs = total / completed.length
  if (avgMs < 60000) return `${(avgMs / 1000).toFixed(0)}s`
  return `${(avgMs / 60000).toFixed(1)} min`
}

export function Statistiche() {
  const [stats, setStats]     = useState<BatchStats | null>(null)
  const [procs, setProcs]     = useState<BatchProcess[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getBatchStats(), getBatchProcesses(0, 1000)])
      .then(([s, p]) => { setStats(s); setProcs(Array.isArray(p) ? p : []) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="pvHint">Caricamento statistiche...</div>

  const k = stats ?? { total: 0, fileReceived: 0, sparkSubmitted: 0, completed: 0, failed: 0, successRate: 0 }

  const pieData = [
    { name: 'File Ricevuto',  value: k.fileReceived,   state: 'FILE_RECEIVED' },
    { name: 'Spark Avviato',  value: k.sparkSubmitted, state: 'SPARK_SUBMITTED' },
    { name: 'Completato',     value: k.completed,      state: 'COMPLETED' },
    { name: 'Fallito',        value: k.failed,         state: 'FAILED' },
  ].filter(d => d.value > 0)

  const hourly  = groupByHour(procs)
  const buckets = groupByBucket(procs)
  const avg     = avgDuration(procs)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📈 Statistiche</h1>
        <p className="page-sub">Analisi delle elaborazioni batch nel tempo</p>
      </div>

      <div className="pvPage">
        {/* KPI strip */}
        <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}>
          {[
            { label: 'Totali', value: fmtN(k.total), color: '#555' },
            { label: 'In attesa', value: fmtN(k.fileReceived), color: STATE_COLORS.FILE_RECEIVED },
            { label: 'In esecuzione', value: fmtN(k.sparkSubmitted), color: STATE_COLORS.SPARK_SUBMITTED },
            { label: 'Completati', value: fmtN(k.completed), color: STATE_COLORS.COMPLETED },
            { label: 'Falliti', value: fmtN(k.failed), color: STATE_COLORS.FAILED },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
              <div className="stat-card-label">{label}</div>
              <div className="stat-card-value" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Distribuzione stati (Pie) */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: 20 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Distribuzione stati</h3>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--color-muted)' }}>
              Success rate: <strong style={{ color: STATE_COLORS.COMPLETED }}>{fmtPct(k.successRate)}</strong>
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value"
                  label={({ name, value }: { name: string; value: number }) => `${name} (${value})`}
                  labelLine={false}>
                  {pieData.map((e, i) => <Cell key={i} fill={STATE_COLORS[e.state] ?? '#ccc'} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [fmtN(v), 'Processi']} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Per bucket */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Elaborazioni per bucket</h3>
            {buckets.length === 0
              ? <div className="empty-state"><div className="empty-state-icon">📭</div><div>Nessun dato</div></div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={buckets} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="bucket" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip />
                    <Bar dataKey="count" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>

        {/* Trend orario */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Trend ultime 24h</h3>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Durata media: <strong>{avg}</strong>
            </span>
          </div>
          {hourly.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">📉</div><div>Nessun dato nelle ultime 24h</div></div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="completed" stroke={STATE_COLORS.COMPLETED} strokeWidth={2} name="Completati" dot={false} />
                  <Line type="monotone" dataKey="failed"    stroke={STATE_COLORS.FAILED}    strokeWidth={2} name="Falliti"    dot={false} />
                  <Line type="monotone" dataKey="submitted" stroke={STATE_COLORS.SPARK_SUBMITTED} strokeWidth={2} name="Avviati" dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
        </div>

        {/* Ultimi fallimenti */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Ultimi errori</h3>
          {procs.filter(p => p.state === 'FAILED').length === 0
            ? <div style={{ color: 'var(--color-muted)', fontSize: 13, fontStyle: 'italic' }}>
                Nessun errore recente 🎉
              </div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)' }}>
                    {['File', 'Errore', 'Quando'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10,
                        fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {procs.filter(p => p.state === 'FAILED').slice(0, 10).map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 10px' }}>
                        <code style={{ fontSize: 11, color: STATE_COLORS.FAILED }}>{p.fileName}</code>
                      </td>
                      <td style={{ padding: '6px 10px', maxWidth: 400 }}>
                        <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'block',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.errorMessage ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <code style={{ fontSize: 10, color: 'var(--color-muted)' }}>{fmtDate(p.updatedAt)}</code>
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
