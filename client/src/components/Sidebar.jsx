// Sidebar — 8 nav items exactly as context.md §4, live incident badge,
// bottom: live status · user card (GET /api/auth/me) · logout.

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { get, post } from '../lib/api'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'monitors', label: 'Monitors', path: '/monitors' },
  { key: 'incidents', label: 'Incidents', path: '/incidents', badge: true },
  { key: 'telemetry', label: 'Telemetry', path: '/telemetry' },
  { key: 'dependencies', label: 'Dependencies', path: '/dependencies' },
  { key: 'recommendations', label: 'Recommendations', path: '/recommendations' },
  { key: 'history', label: 'History & Reports', path: '/history' },
  { key: 'settings', label: 'Settings', path: '/settings' },
]

export const Sidebar = ({ dataPage }) => {
  const navigate = useNavigate()
  const [openIncidents, setOpenIncidents] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const h = await get('/health')
        if (alive) setOpenIncidents(h.openIncidents ?? 0)
      } catch { if (alive) setOpenIncidents(0) }
      try {
        const me = await get('/auth/me')
        if (alive) setUser(me)
      } catch { /* unauthenticated — RequireAuth handles redirect */ }
    })()
    return () => { alive = false }
  }, [])

  // dataPage → active nav key (diff → incidents, states → dashboard)
  const activeKey =
    dataPage === 'diff' ? 'incidents' :
    dataPage === 'states' ? 'dashboard' :
    dataPage

  const logout = async () => {
    try { await post('/auth/logout') } catch { /* session may be gone */ }
    navigate('/login', { replace: true })
  }

  return (
    <aside className="w-64 bg-white h-screen flex flex-col border-r border-slate-200 fixed top-0 left-0 z-30">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-brand">Setu</span>
          <span className="pill-neutral text-[10px] uppercase tracking-wider">Prod</span>
        </Link>
      </div>

      {/* Workspace */}
      <div className="px-4 py-3 border-b border-slate-200">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Workspace</p>
        <div className="flex items-center gap-2 text-sm text-ink font-medium">
          <span className="w-6 h-6 rounded-md bg-brand text-white text-xs font-bold flex items-center justify-center">S</span>
          Setu Demo
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto" aria-label="Main">
        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
        {NAV_ITEMS.map((item) => {
          const active = activeKey === item.key
          return (
            <Link
              key={item.key}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{item.label}</span>
              {item.badge && openIncidents > 0 && (
                <span className={`badge-count ${active ? '!bg-white !text-brand' : ''}`}>
                  {openIncidents}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Live status */}
      <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
        <span className="text-slate-500">Live probes</span>
        <span className="pill-ok">● Active</span>
      </div>

      {/* User card */}
      <div className="px-3 py-3 border-t border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-brand/10 text-brand font-semibold flex items-center justify-center shrink-0 overflow-hidden">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            (user?.name || 'S').split(' ').map((p) => p[0]).slice(0, 2).join('')
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink truncate">{user?.name || '…'}</p>
          <p className="text-xs text-slate-400 truncate">{user?.provider ? `Signed in with ${user.provider}` : ''}</p>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className="text-slate-400 hover:text-bad transition-colors p-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
