// Topbar — Setu Studio / current page · search · Healthy pill · environment · bell · Feedback
// (search, environment, bell and Feedback are visual only, context.md §4)

import React from 'react'
import { Search, Bell, ChevronRight, MessageSquare } from 'lucide-react'
import { NAV_ITEMS, activeKeyFor, SUB_PAGES } from './nav'

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

        <div className="hidden md:flex items-center gap-3 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search monitors, incidents…"
              aria-label="Search"
              className="input-base w-full !py-1.5 pl-8 bg-slate-50"
            />
          </div>
          <span className="pill-ok"><span className="w-1.5 h-1.5 rounded-full bg-ok" aria-hidden="true" />Healthy</span>
          <select className="input-base !py-1.5 !pr-8 bg-slate-50" aria-label="Environment" defaultValue="Production">
            <option>Production</option>
            <option>Staging</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button className="text-slate-400 hover:text-ink hover:bg-slate-100 rounded-lg p-2 transition-colors" aria-label="Notifications">
            <Bell size={17} aria-hidden="true" />
          </button>
          <button className="btn-secondary !py-1.5 !px-3 !text-xs">
            <MessageSquare size={14} aria-hidden="true" /> Feedback
          </button>
        </div>
      </div>
    </header>
  )
}
