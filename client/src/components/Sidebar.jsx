// Sidebar — 8 nav items exactly as context.md §4

import React from 'react'
import { Link } from 'react-router-dom'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', exact: '/' },
  { key: 'monitors', label: 'Monitors', path: '/monitors' },
  { key: 'incidents', label: 'Incidents', path: '/incidents', badge: true },
  { key: 'telemetry', label: 'Telemetry', path: '/telemetry' },
  { key: 'dependencies', label: 'Dependencies', path: '/dependencies' },
  { key: 'recommendations', label: 'Recommendations', path: '/recommendations' },
  { key: 'history', label: 'History & Reports', path: '/history' },
  { key: 'settings', label: 'Settings', path: '/settings' },
]

export const Sidebar = ({ dataPage }) => {
  const isActive = (page) => {
    if (page === 'diff') return dataPage === 'incidents'
    if (page === 'states') return dataPage === 'dashboard'
    return dataPage === page
  }

  return (
    <aside className="w-64 bg-white h-screen flex flex-col border-r border-slate-200">
      <div className="p-4 border-b border-slate-200">
        <span className="text-2xl font-bold text-brand">Setu</span>
      </div>
      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.key)
          const badge = item.badge ? (
            <span className="pill-neutral text-xs ml-1">•</span>
          ) : null
          return (
            <Link
              key={item.key}
              to={item.path}
              className={`block px-3 py-2 rounded-md text-slate-600 ${
                active ? 'bg-brand text-white' : ''
              } ${item.badge ? 'after:ml-2' : ''}`}
            >
              {item.label}{badge}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 flex items-center justify-between">
        <span className="text-slate-500 text-sm">Live</span>
        <span className="pill-ok text-xs">●</span>
      </div>

      <div className="p-3 mt-auto flex items-center">
        <span className="text-slate-500 text-sm">Sarah Chen</span>
      </div>
    </aside>
  )
}