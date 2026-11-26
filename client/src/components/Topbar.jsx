// Topbar — Setu Studio / current page · bell (live, see NotificationBell)
// Visual-only controls (search, Healthy pill, environment, Feedback) removed.

import React from 'react'
import { ChevronRight } from 'lucide-react'
import { NAV_ITEMS, activeKeyFor, SUB_PAGES } from './nav'
import { NotificationBell } from './NotificationBell'

export const Topbar = ({ dataPage }) => {
  const section = NAV_ITEMS.find((n) => n.key === activeKeyFor(dataPage))
  const sub = SUB_PAGES[dataPage]

  return (
    <header className="fixed top-0 left-64 right-0 h-14 z-20 border-b border-slate-200 bg-surface/90 backdrop-blur">
      <div className="h-full px-6 flex items-center justify-between gap-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 text-sm">
          <span className="font-semibold text-ink whitespace-nowrap">Setu Studio</span>
          {section && (
            <>
              <ChevronRight size={14} className="text-slate-300 shrink-0" aria-hidden="true" />
              <span className={`truncate ${sub ? 'text-muted' : 'text-ink'}`}>{section.label}</span>
            </>
          )}
          {sub && (
            <>
              <ChevronRight size={14} className="text-slate-300 shrink-0" aria-hidden="true" />
              <span className="text-ink truncate">{sub}</span>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
