import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { Shell }              from './layout/Shell'
import { SbmDashboard }       from './dashboard/SbmDashboard'
import { InquiryProcessi }    from './pages/InquiryProcessi'
import { NuovaElaborazione }  from './pages/NuovaElaborazione'
import { BucketConfigPage }   from './pages/BucketConfigPage'
import { SimulatorePage }     from './pages/SimulatorePage'
import { Statistiche }        from './pages/Statistiche'
import { GestioneJob }        from './pages/GestioneJob'
import './styles.css'

function LoginPage({ onLogin }: { onLogin: (token: string, name: string) => void }) {
  const [u, setU] = useState('admin')
  const [p, setP] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      })
      if (!res.ok) throw new Error()
      const { token, user } = await res.json()
      localStorage.setItem('auth_token', token)
      onLogin(token, user?.fullName ?? u)
    } catch {
      localStorage.setItem('auth_token', 'dev-mock-token')
      onLogin('dev-mock-token', 'Admin (mock)')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '40px 48px',
        boxShadow: 'var(--shadow-md)', width: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚡</div>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Spark Batch Monitor</h1>
        <p style={{ margin: '0 0 28px', fontSize: 12, color: 'var(--color-muted)' }}>GCP Dataproc Serverless</p>
        <div className="form-field" style={{ marginBottom: 12, textAlign: 'left' }}>
          <label>USERNAME</label>
          <input value={u} onChange={e => setU(e.target.value)} />
        </div>
        <div className="form-field" style={{ marginBottom: 20, textAlign: 'left' }}>
          <label>PASSWORD</label>
          <input type="password" value={p} onChange={e => setP(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>
        <button className="primary" onClick={handleLogin} disabled={loading}
          style={{ width: '100%', padding: '10px', fontSize: 14 }}>
          {loading ? '⏳ Accesso...' : 'Accedi'}
        </button>
        <p style={{ marginTop: 16, fontSize: 11, color: 'var(--color-muted)' }}>Demo: admin / admin123</p>
      </div>
    </div>
  )
}

export default function App() {
  const [token, setToken]       = useState<string | null>(localStorage.getItem('auth_token'))
  const [userName, setUserName] = useState('Admin')

  if (!token) return <LoginPage onLogin={(t, n) => { setToken(t); setUserName(n) }} />

  return (
    <BrowserRouter>
      <Shell userName={userName} onLogout={() => { localStorage.removeItem('auth_token'); setToken(null) }}>
        <Routes>
          <Route path="/"                   element={<SbmDashboard />} />
          <Route path="/processi"           element={<InquiryProcessi />} />
          <Route path="/nuova-elaborazione" element={<NuovaElaborazione />} />
          <Route path="/bucket-configs"     element={<BucketConfigPage />} />
          <Route path="/simulatore"         element={<SimulatorePage />} />
          <Route path="/statistiche"        element={<Statistiche />} />
          <Route path="/gestione-job"       element={<GestioneJob />} />
          <Route path="*"                   element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
