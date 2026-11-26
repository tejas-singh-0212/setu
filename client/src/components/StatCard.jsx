// StatCard — label · big value · optional context line (children)

import React from 'react'

export const StatCard = ({ label, value, delta, children }) => {
  const deltaClass = delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-muted'
  const deltaSign = typeof delta === 'number' && delta > 0 ? '+' : ''

  return (
    <div className="stat-card">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-3xl font-bold tracking-tight text-ink truncate">{value}</span>
        {delta !== undefined && (
          <span className={`text-sm font-medium ${deltaClass}`}>{deltaSign}{delta}</span>
        )}
      </div>
      {children && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">{children}</div>
      )}
    </div>
  )
}
