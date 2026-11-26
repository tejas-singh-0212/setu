// Topbar — Setu Studio · search · Healthy pill · environment · bell · Feedback
// (search, environment, Feedback are visual-only, context.md §4;
//  the bell is live — see NotificationBell)

import React from 'react'
import { NotificationBell } from './NotificationBell'

export const Topbar = () => (
  <header className="fixed top-0 left-64 right-0 h-14 z-20 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
    <div className="h-full px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-lg font-semibold text-ink truncate">Setu Studio</span>
      </div>

      <div className="hidden md:flex items-center gap-4 flex-1 max-w-xl">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search…"
            aria-label="Search"
            className="input-base w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-sm bg-slate-50"
          />
        </div>
        <span className="pill-ok whitespace-nowrap">● Healthy</span>
        <select className="input-base rounded-lg border border-slate-200 py-1.5 text-sm bg-slate-50" aria-label="Environment" defaultValue="Production">
          <option>Production</option>
          <option>Staging</option>
        </select>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <NotificationBell />
        <button className="btn-secondary text-xs py-1.5 px-3">Feedback</button>
      </div>
    </div>
  </header>
)
