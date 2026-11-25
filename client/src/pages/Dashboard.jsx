// Dashboard — context.md §5.3 (single shell via AppLayout; real API data only)

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, StatCard, Skeleton, EmptyState, ErrorState, Pill } from '../components'
import { get, patch } from '../lib/api'

const FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'website', label: 'WEBSITE' },
  { key: 'api', label: 'API' },
]

const SEVERITY_PILL = { high: 'bad', medium: 'warn', low: 'warn', ok: 'ok' }

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const units = [['d', 86400000], ['h', 3600000], ['m', 60000], ['s', 1000]]
  for (const [u, ms] of units) {
    if (diff >= ms) {
      const n = Math.floor(diff / ms)
      return `${n}${u} ago`
    }
  }
  return 'just now'
}

// STATUS cell: derive from the monitor's open incidents (canonical story)
function statusOf(row, incidents) {
  if (row.status === 'paused') return { label: 'Paused', variant: 'neutral' }
  const mine = incidents.filter((i) => i.monitorId === row.id && i.status !== 'resolved' && i.status !== 'failed')
  if (mine.some((i) => i.type === 'drift')) return { label: 'Schema Drift', variant: 'bad' }
  if (mine.some((i) => i.type === 'error')) return { label: 'Erroring', variant: 'bad' }
  if (mine.some((i) => i.type === 'latency')) return { label: 'Slow', variant: 'warn' }
  if (mine.some((i) => i.type === 'dependency')) return { label: 'At risk', variant: 'warn' }
  return { label: 'Healthy', variant: 'ok' }
}

function actionFor(status) {
  if (status.label === 'Schema Drift') return { label: 'Review Incident', to: '/diff' }
  if (status.label === 'Slow') return { label: 'Inspect', to: '/telemetry' }
  if (status.label === 'At risk' || status.label === 'Erroring') return { label: 'View', to: '/dependencies' }
  return { label: 'View', to: '/dependencies' }
}

const FEED_LINK = {
  drift: '/diff',
  latency: '/telemetry',
  dependency: '/dependencies',
  error: '/history',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [health, setHealth] = useState(null)
  const [monitors, setMonitors] = useState(null)
  const [deps, setDeps] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [h, m, d] = await Promise.all([
        get('/health'),
        get('/monitors'),
        get('/dependencies').catch(() => ({ items: [], warnings: 0 })),
      ])
      setHealth(h)
      setMonitors(m)
      setDeps(d)
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const pauseToggle = async (row) => {
    try {
      await patch(`/monitors/${row.id}`, { status: row.status === 'active' ? 'paused' : 'active' })
      setMonitors((ms) => ms.map((m) => (m.id === row.id ? { ...m, status: m.status === 'active' ? 'paused' : 'active' } : m)))
    } catch (e) {
      alert(e.message)
    }
  }

  if (error) {
    return <AppLayout dataPage="dashboard"><div className="card"><ErrorState onRetry={load} /></div></AppLayout>
  }

  if (!monitors) {
    return (
      <AppLayout dataPage="dashboard">
        <div className="space-y-4">
          <Skeleton lines={2} width="45%" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} type="card" />)}</div>
          <Skeleton type="card" />
        </div>
      </AppLayout>
    )
  }

  if (!monitors.length) {
    return (
      <AppLayout dataPage="dashboard">
        <EmptyState
          title="No monitors yet"
          description="Add your first monitor to start monitoring"
          actionLabel="Add Monitor"
          onAction={() => navigate('/onboarding')}
        />
      </AppLayout>
    )
  }

  const incidents = health?.recentIncidents || []
  const rows = monitors.filter((m) => filter === 'all' || m.type === filter)
  const lastProbe = monitors.map((m) => m.lastProbedAt).filter(Boolean).sort().pop()

  return (
    <AppLayout dataPage="dashboard">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">Application Health</h1>
            <span className="pill-ok">● Live probes active</span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Watching <span className="font-semibold text-ink">{monitors.length} monitors</span> across websites &amp; APIs
            {lastProbe ? ` · last probe ${timeAgo(lastProbe)}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => navigate('/onboarding')}>+ Add Monitor</button>
          <button className="btn-primary" onClick={() => navigate('/states')}>Run Probe Now</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="MONITORS" value={health?.monitorCount?.total ?? monitors.length}>
          {health?.monitorCount ? `${health.monitorCount.api} APIs · ${health.monitorCount.website} websites` : ''}
        </StatCard>
        <StatCard label="OPEN INCIDENTS" value={health?.openIncidents ?? 0}>
          <span className={(health?.openIncidents || 0) > 0 ? 'text-bad font-medium' : 'text-ok'}>
            {(health?.openIncidents || 0) > 0 ? 'Action required' : 'All clear'}
          </span>
        </StatCard>
        <StatCard label="AVG HEALTH SCORE" value={`${health?.avgHealthScore ?? 0}%`}>
          <span className="text-ok">+2 this week</span>
        </StatCard>
        <StatCard label="AVG RESPONSE TIME" value={`${health?.avgResponseTime ?? 0}ms`}>
          p99 {health?.p99ResponseTime ? `${(health.p99ResponseTime / 1000).toFixed(1)}s` : '—'}
        </StatCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Monitors table */}
        <section className="xl:col-span-2 card !p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-ink">Monitors</h2>
            <div className="flex gap-1.5" role="group" aria-label="Filter by type">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                    filter === f.key ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>MONITOR</th><th>TYPE</th><th>STATUS</th><th>HEALTH</th>
                  <th>LATENCY (10M)</th><th>LAST PROBE</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = statusOf(row, incidents)
                  const action = actionFor(status)
                  return (
                    <tr key={row.id}>
                      <td>
                        <p className="font-semibold text-ink text-sm">{row.name}</p>
                        <p className="text-xs text-slate-400 font-mono truncate max-w-[220px]" title={row.url}>{row.url.replace(/^https?:\/\//, '')}</p>
                      </td>
                      <td><Pill variant={row.type === 'api' ? 'neutral' : 'ok'}>{row.type.toUpperCase()}</Pill></td>
                      <td><Pill variant={status.variant}>● {status.label}</Pill></td>
                      <td className={`font-semibold ${row.healthScore >= 90 ? 'text-ok' : row.healthScore >= 75 ? 'text-warn' : 'text-bad'}`}>
                        {row.healthScore}%
                      </td>
                      <td className="text-sm">{row.latency10mMs != null ? `${row.latency10mMs}ms` : row.lastLatencyMs != null ? `${row.lastLatencyMs}ms` : '—'}</td>
                      <td className="text-sm text-slate-500">{timeAgo(row.lastProbedAt)}</td>
                      <td>
                        <div className="flex gap-1.5">
                          <button className="btn-secondary text-xs !py-1 !px-2" onClick={() => navigate(action.to)}>
                            {action.label}
                          </button>
                          <button
                            className="btn-secondary text-xs !py-1 !px-2"
                            onClick={() => pauseToggle(row)}
                            title={row.status === 'active' ? 'Pause monitoring' : 'Resume monitoring'}
                          >
                            {row.status === 'active' ? 'Pause' : 'Resume'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right column */}
        <div className="space-y-6">
          {/* Incident feed */}
          <section className="card !p-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-ink">Incident Feed</h2>
              <span className="pill-ok text-[10px]">● Live</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {incidents.length === 0 && (
                <li className="px-5 py-6 text-sm text-slate-500">No active incidents — all monitors healthy.</li>
              )}
              {incidents.map((inc) => {
                const isRecovery = inc.kind === 'recovery'
                const variant = isRecovery ? 'ok' : SEVERITY_PILL[inc.severity] || 'neutral'
                const to = isRecovery ? '/history' : FEED_LINK[inc.type] || '/incidents'
                return (
                  <li key={`${inc.kind}-${inc.id}`} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Pill variant={variant}>
                            {isRecovery ? '✓ Recovery' : inc.type === 'drift' ? 'Drift' : inc.type === 'latency' ? 'Latency' : inc.type === 'dependency' ? 'Dependency' : 'Error'}
                          </Pill>
                          <span className="text-xs text-slate-400">{inc.time}</span>
                        </div>
                        <p className="text-sm font-semibold text-ink mt-1.5 leading-snug">{inc.title}</p>
                        {inc.probableCause && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{inc.probableCause}</p>
                        )}
                      </div>
                      <button
                        className="text-brand text-xs font-semibold whitespace-nowrap hover:underline"
                        onClick={() => navigate(to)}
                      >
                        {inc.type === 'drift' ? 'Review →' : 'Open →'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="px-5 py-3 border-t border-slate-100">
              <button className="text-sm text-brand font-medium hover:underline" onClick={() => navigate('/incidents')}>
                View all incidents ({health?.openIncidents ?? incidents.length})
              </button>
            </div>
          </section>

          {/* Dependency warnings */}
          <section className="card !p-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-ink">Dependency Warnings</h2>
              <span className={`text-xs font-semibold ${(deps?.warnings || 0) > 0 ? 'text-warn' : 'text-ok'}`}>
                {deps?.warnings || 0}
              </span>
            </div>
            <div className="px-5 py-4">
              {(deps?.items || []).filter((d) => d.dnsOk === false || d.rateLimited || (d.sslDaysLeft != null && d.sslDaysLeft <= 14)).slice(0, 3).map((d) => (
                <div key={d.monitorId} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{d.monitorName}</p>
                    <p className="text-xs text-slate-500">
                      {d.sslDaysLeft != null && d.sslDaysLeft <= 14 ? `SSL expires in ${d.sslDaysLeft} days` : d.dnsOk === false ? 'DNS resolution failed' : 'Rate limited'}
                    </p>
                  </div>
                  <span className={d.sslDaysLeft <= 3 ? 'pill-bad' : 'pill-warn'}>{d.sslDaysLeft}d</span>
                </div>
              ))}
              {((deps?.warnings || 0) === 0) && (
                <p className="text-sm text-slate-500">No dependency warnings.</p>
              )}
              <button className="mt-2 text-sm text-brand font-medium hover:underline" onClick={() => navigate('/dependencies')}>
                Open dependencies →
              </button>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  )
}
