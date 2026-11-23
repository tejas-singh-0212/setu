// StatCard — statistic card used in Dashboard

import React from 'react'

export const StatCard = ({ label, value, delta, children }) => {
  const deltaClass = delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-muted'
  const deltaSign = delta !== undefined ? (delta > 0 ? '+' : '') : ''

  return (
    <div className="stat-card">
      <div>
        <span className="text-slate-500 text-xs uppercase tracking-wider">{label}</span>
        <span className="text-3xl font-bold text-ink">{value}</span>
      </div>
      {delta !== undefined && (
        <span className={deltaClass}>{deltaSign}{delta}</span>
      )}
      {children && <div className="mt-2 text-slate-400 text-sm">{children}</div>}
    </div>
  )
}