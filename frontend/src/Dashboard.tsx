import { useEffect, useState, useCallback } from 'react'
import { Title, useDataProvider } from 'react-admin'
import {
  Box, Card, CardContent, Typography,
  CircularProgress, Divider, Chip, IconButton, Tooltip,
} from '@mui/material'
import RefreshIcon       from '@mui/icons-material/Refresh'
import BoltIcon          from '@mui/icons-material/Bolt'
import ErrorOutlineIcon  from '@mui/icons-material/ErrorOutline'
import TimerIcon         from '@mui/icons-material/Timer'
import EventRepeatIcon   from '@mui/icons-material/EventRepeat'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface KpiData {
  runningJobs:     number | null
  failedToday:     number | null
  avgDurationMs:   number | null
  activeSchedules: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms === 0)   return '0 ms'
  if (ms < 1000)  return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return `${min}m ${sec}s`
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title:     string
  value:     string | number | null
  icon:      React.ReactNode
  color:     string
  subtitle:  string
  loading:   boolean
  chip?:     { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }
}

function KpiCard({ title, value, icon, color, subtitle, loading, chip }: KpiCardProps) {
  return (
    <Card sx={{
      flex: '1 1 220px',
      minWidth: 210,
      borderRadius: 3,
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      borderTop: `4px solid ${color}`,
      transition: 'transform .15s, box-shadow .15s',
      '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 8px 28px rgba(0,0,0,0.13)' },
    }}>
      <CardContent sx={{ p: 3 }}>

        {/* Icon row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{
            width: 48, height: 48, borderRadius: 2,
            backgroundColor: color + '20',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color,
          }}>
            {icon}
          </Box>
          {chip && (
            <Chip label={chip.label} color={chip.color} size="small"
              sx={{ fontWeight: 700, fontSize: 11 }} />
          )}
        </Box>

        {/* Value */}
        <Box sx={{ minHeight: 48, display: 'flex', alignItems: 'center' }}>
          {loading
            ? <CircularProgress size={32} sx={{ color }} />
            : <Typography variant="h3" sx={{ fontWeight: 700, color, lineHeight: 1 }}>
                {value ?? '—'}
              </Typography>
          }
        </Box>

        {/* Labels */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mt: 1.5 }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {subtitle}
        </Typography>

      </CardContent>
    </Card>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const Dashboard = () => {
  const dataProvider = useDataProvider()
  const [kpi, setKpi]         = useState<KpiData>({
    runningJobs: null, failedToday: null, avgDurationMs: null, activeSchedules: null,
  })
  const [loading, setLoading]     = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const BASE_URL = (window as any).__VITE_API_URL__ || 'http://localhost:8081/api'

  const fetchKpi = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Chiama l'endpoint backend dedicato GET /api/dashboard/kpi
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`${BASE_URL}/dashboard/kpi`, { headers })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      setKpi({
        runningJobs:     data.runningJobs     ?? 0,
        failedToday:     data.failedToday     ?? 0,
        avgDurationMs:   data.avgDurationMs   ?? null,
        activeSchedules: data.activeSchedules ?? 0,
      })
      setLastUpdate(new Date())
    } catch (err: any) {
      console.error('Dashboard KPI fetch error:', err)
      setError('Impossibile caricare i KPI. Verifica che il servizio sia attivo.')
    } finally {
      setLoading(false)
    }
  }, [BASE_URL])

  // Mount + auto-refresh ogni 30s
  useEffect(() => {
    fetchKpi()
    const interval = setInterval(fetchKpi, 30_000)
    return () => clearInterval(interval)
  }, [fetchKpi])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <Title title="Dashboard — Spark Monitor" />

      {/* ── Header ── */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            🔥 Spark Monitor
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Panoramica in tempo reale dei job Apache Spark
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {lastUpdate && (
            <Typography variant="caption" color="text.disabled">
              Aggiornato: {lastUpdate.toLocaleTimeString('it-IT')} · ogni 30s
            </Typography>
          )}
          <Tooltip title="Aggiorna ora">
            <IconButton onClick={fetchKpi} disabled={loading} size="small">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── Error banner ── */}
      {error && (
        <Box sx={{ mb: 3, p: 2, borderRadius: 2, backgroundColor: '#ffebee', border: '1px solid #ffcdd2' }}>
          <Typography variant="body2" color="error">{error}</Typography>
        </Box>
      )}

      {/* ── KPI Cards ── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>

        {/* 1 — Job in esecuzione */}
        <KpiCard
          title="Job in Esecuzione"
          value={kpi.runningJobs}
          icon={<BoltIcon fontSize="medium" />}
          color="#1565c0"
          subtitle="Job con status = RUNNING"
          loading={loading}
          chip={
            kpi.runningJobs !== null
              ? kpi.runningJobs > 0
                ? { label: 'ATTIVI', color: 'info' }
                : { label: 'NESSUNO', color: 'default' }
              : undefined
          }
        />

        {/* 2 — Job falliti oggi */}
        <KpiCard
          title="Job Falliti Oggi"
          value={kpi.failedToday}
          icon={<ErrorOutlineIcon fontSize="medium" />}
          color="#c62828"
          subtitle={`Da mezzanotte del ${new Date().toLocaleDateString('it-IT')}`}
          loading={loading}
          chip={
            kpi.failedToday !== null
              ? kpi.failedToday > 0
                ? { label: 'ATTENZIONE', color: 'error' }
                : { label: 'OK', color: 'success' }
              : undefined
          }
        />

        {/* 3 — Media durata ultime 24h */}
        <KpiCard
          title="Media Durata (24h)"
          value={formatDuration(kpi.avgDurationMs)}
          icon={<TimerIcon fontSize="medium" />}
          color="#e65100"
          subtitle="Media esecuzioni SUCCEEDED nelle ultime 24h"
          loading={loading}
        />

        {/* 4 — Schedule attive */}
        <KpiCard
          title="Schedule Attive"
          value={kpi.activeSchedules}
          icon={<EventRepeatIcon fontSize="medium" />}
          color="#2e7d32"
          subtitle="Schedulazioni con enabled = true"
          loading={loading}
          chip={
            kpi.activeSchedules !== null
              ? kpi.activeSchedules > 0
                ? { label: 'OPERATIVE', color: 'success' }
                : { label: 'NESSUNA', color: 'default' }
              : undefined
          }
        />

      </Box>

      {/* ── Info strip ── */}
      <Box sx={{ backgroundColor: '#f4f6f8', borderRadius: 2, p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          💡 <strong>Endpoint backend:</strong>{' '}
          <code>GET /api/dashboard/kpi</code> — restituisce i 4 KPI in una singola query ottimizzata.
          I dati si aggiornano automaticamente ogni 30 secondi oppure tramite il pulsante ↻.
        </Typography>
      </Box>

    </Box>
  )
}
