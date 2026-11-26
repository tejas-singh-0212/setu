// Sidebar — logo + 8 nav items exactly as context.md §4, live incident badge,
// bottom: live status · user card (GET /api/auth/me) · logout.

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { get, post } from '../lib/api'
import { NAV_ITEMS, activeKeyFor } from './nav'

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

  const activeKey = activeKeyFor(dataPage)

  const logout = async () => {
    try { await post('/auth/logout') } catch { /* session may be gone */ }
    navigate('/login', { replace: true })
  }

  const initials = (user?.name || user?.email || 'S').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  const provider = user?.provider === 'github' ? 'GitHub' : user?.provider === 'google' ? 'Google' : null

  return (
    <aside className="w-64 bg-surface h-screen flex flex-col border-r border-slate-200 fixed top-0 left-0 z-30">
      {/* Brand */}
      <div className="h-14 px-4 border-b border-slate-200 flex items-center">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg -mx-1 px-1 py-1" aria-label="Setu — Dashboard">
          <img src="/logo-mark.svg" alt="" className="w-8 h-8 rounded-lg" />
          <span className="text-lg font-bold tracking-tight text-ink">Setu</span>
        </Link>
      </div>

      {/* Workspace */}
      <div className="px-4 py-3 border-b border-slate-200">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Workspace</p>
        <div className="flex items-center gap-2 text-sm text-ink font-medium">
          <span className="w-6 h-6 rounded-md bg-brand/10 text-brand text-xs font-bold flex items-center justify-center">S</span>
          Setu Demo
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Main">
        {NAV_ITEMS.map(({ key, label, path, icon: Icon, badge }) => {
          const active = activeKey === key
          return (
            <Link
              key={key}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
              }`}
            >
              <Icon size={17} aria-hidden="true" className={active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'} />
              <span className="flex-1">{label}</span>
              {badge && openIncidents > 0 && (
                <span className={`badge-count ${active ? '!bg-white !text-brand' : ''}`} aria-label={`${openIncidents} open incidents`}>
                  {openIncidents}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Live status */}
      <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
        <span className="text-muted">Live probes</span>
        <span className="pill-ok">
          <span className="relative flex w-1.5 h-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 animate-ping" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-ok" />
          </span>
          Active
        </span>
      </div>

      {/* User card */}
      <div className="px-3 py-3 border-t border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-brand/10 text-brand text-sm font-semibold flex items-center justify-center shrink-0 overflow-hidden">
          {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink truncate">{user?.name || '…'}</p>
          <p className="text-xs text-muted truncate">{provider ? `Signed in with ${provider}` : ''}</p>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className="text-slate-400 hover:text-bad hover:bg-bad/5 rounded-lg transition-colors p-1.5"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
