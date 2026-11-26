// NotificationBell — topbar bell with live notifications.
// Shows the signed-in user's OPEN incidents: count badge + dropdown.
// Data: GET /api/incidents?status=open&range=all (session-scoped on the server).

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get } from '../lib/api'

const SEVERITY_DOT = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
}

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export const NotificationBell = () => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null) // null = loading
  const [error, setError] = useState(false)
  const wrapRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const rows = await get('/incidents?status=open&range=all')
      setItems(Array.isArray(rows) ? rows : [])
      setError(false)
    } catch {
      setError(true) // keep last known items
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load])

  // close on outside click / Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = items ? items.length : 0
  const shown = (items || []).slice(0, 8)
  const go = () => { setOpen(false); navigate('/incidents') }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={count ? `Notifications, ${count} open incidents` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative text-slate-400 hover:text-slate-600 p-1"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-30">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {count > 0 && <span className="pill-bad">{count} open</span>}
          </div>

          {items === null && !error && (
            <div className="p-4 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-4 rounded bg-slate-100 animate-pulse" style={{ width: `${90 - i * 20}%` }} />
              ))}
            </div>
          )}

          {items === null && error && (
            <div className="p-4 text-sm text-slate-500">
              Couldn’t load notifications.{' '}
              <button type="button" className="text-brand hover:underline" onClick={load}>Retry</button>
            </div>
          )}

          {items !== null && count === 0 && (
            <div className="p-4 text-sm text-slate-500">All clear — no open incidents.</div>
          )}

          {shown.length > 0 && (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {shown.map((inc) => (
                <li key={inc.id}>
                  <button
                    type="button"
                    onClick={go}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[inc.severity] || 'bg-slate-300'}`} />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink truncate">{inc.title}</span>
                      <span className="block text-xs text-slate-500 truncate">
                        {inc.monitorName} · {timeAgo(inc.openedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {count > 0 && (
            <button
              type="button"
              onClick={go}
              className="w-full px-4 py-2.5 text-xs font-medium text-brand text-center border-t border-slate-100 hover:bg-slate-50"
            >
              View all incidents →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
