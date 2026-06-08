import { useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const NAV_GROUPS = [
  {
    label: 'Monitoraggio',
    items: [
      { id: 'dashboard',   label: 'Dashboard',         icon: '📊', path: '/'           },
      { id: 'processi',    label: 'Inquiry Processi',   icon: '🔍', path: '/processi'   },
      { id: 'statistiche', label: 'Statistiche',        icon: '📈', path: '/statistiche'},
    ],
  },
  {
    label: 'Censimento',
    items: [
      { id: 'gestione-job',       label: 'Gestione Job',         icon: '⚙️', path: '/gestione-job'       },
      { id: 'nuova-elaborazione', label: 'Nuova Elaborazione',   icon: '➕', path: '/nuova-elaborazione' },
      { id: 'bucket-configs',     label: 'Config Bucket',        icon: '🗂', path: '/bucket-configs'     },
    ],
  },
  {
    label: 'Operatività',
    items: [
      { id: 'simulatore', label: 'Trigger & Scheduler', icon: '🔧', path: '/simulatore' },
    ],
  },
]

interface Props { children: ReactNode; userName?: string; onLogout?: () => void }

export function Shell({ children, userName = 'Admin', onLogout }: Props) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  function isActive(path: string) {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button className="topbar-btn" onClick={() => setCollapsed(c => !c)}
          style={{ padding: '5px 8px', fontSize: 16 }}>☰</button>
        <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => navigate('/')}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <span className="topbar-title">Spark Batch Monitor</span>
          <span className="topbar-sub">GCP Dataproc</span>
        </span>
        <div className="topbar-spacer" />
        <div className="topbar-user"><span>👤 {userName}</span></div>
        {onLogout && <button className="topbar-btn" onClick={onLogout}>Esci</button>}
      </header>

      <div className="shellBody" style={{
        gridTemplateColumns: collapsed ? '0 1fr' : 'var(--sidebar-w) 1fr',
        transition: 'grid-template-columns .2s',
      }}>
        <aside className="sidebar" style={{ overflow: collapsed ? 'hidden' : undefined }}>
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <div className="nav-section-label">{group.label}</div>
              {group.items.map(item => (
                <button key={item.id}
                  className={`nav-btn ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main className="main-area">{children}</main>
      </div>
    </div>
  )
}
