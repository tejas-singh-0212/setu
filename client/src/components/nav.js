// Navigation map shared by Sidebar + Topbar — the 8 items from context.md §4, in order.

import { LayoutDashboard, Radar, Siren, Activity, Network, Lightbulb, History, Settings } from 'lucide-react'

export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { key: 'monitors', label: 'Monitors', path: '/monitors', icon: Radar },
  { key: 'incidents', label: 'Incidents', path: '/incidents', icon: Siren, badge: true },
  { key: 'telemetry', label: 'Telemetry', path: '/telemetry', icon: Activity },
  { key: 'dependencies', label: 'Dependencies', path: '/dependencies', icon: Network },
  { key: 'recommendations', label: 'Recommendations', path: '/recommendations', icon: Lightbulb },
  { key: 'history', label: 'History & Reports', path: '/history', icon: History },
  { key: 'settings', label: 'Settings', path: '/settings', icon: Settings },
]

// data-page → active nav key (diff → incidents, states → dashboard)
export const activeKeyFor = (dataPage) =>
  dataPage === 'diff' ? 'incidents' : dataPage === 'states' ? 'dashboard' : dataPage

// Extra crumb for pages that live under another nav item
export const SUB_PAGES = { diff: 'Diff & Approval', states: 'UI States' }
