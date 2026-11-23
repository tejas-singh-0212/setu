// Dashboard — context.md §5.3

import { useEffect, useState } from 'react'
import { DataTable, StatCard, Pill, Skeleton, EmptyState } from '../components'
import { AppLayout } from '../components/AppLayout'

export default function Dashboard() {
  const [health, setHealth] = useState(null)
  const [monitors, setMonitors] = useState(null)
  const [incidents, setIncidents] = useState(null)
  const [deps, setDeps] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Health aggregates
        const h = await fetch('/api/health', { credentials: 'include' }).then(r => r.json())
        setHealth(h)

        // Monitors table
        const m = await fetch('/api/monitors', { credentials: 'include' }).then(r => r.json())
        setMonitors(m)

        // Incidents feed
        const inc = await fetch('/api/incidents', { credentials: 'include' }).then(r => r.json())
        setIncidents(inc)

        // Dependency warnings
        const d = await fetch('/api/dependencies', { credentials: 'include' }).then(r => r.json())
        setDeps(d)
      } catch (e) {
        console.error('Dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <AppLayout dataPage="dashboard">
        <div className="min-h-screen bg-cream p-8">
          <Skeleton rows={4} />
          <Skeleton className="h-96 w-full rounded-2xl bg-slate-100 animate-pulse mt-4" />
        </div>
      </AppLayout>
    )
  }

  if (!monitors || !monitors.length) {
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

  return (
    <AppLayout dataPage="dashboard">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 items-center justify-between flex">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">Application Health</h1>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <span className="pill-ok text-xs">● Healthy</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm">● Live probes active</span>
          </div>
        </div>
      </header>

      <main className="ml-64 pt-14 p-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard label="MONITORS" value={health?.monitorCount?.total || '0'} delta={health?.monitorCount?.api > 0 ? '+2 this week' : undefined} />
          <StatCard label="OPEN INCIDENTS" value={health?.openIncidents || '0'} delta="Action required" deltaColor="bad" />
          <StatCard label="AVG HEALTH SCORE" value={`${health?.avgHealthScore || '0'}%`} delta="+2 this week" />
          <StatCard label="AVG RESPONSE TIME" value={`${health?.avgResponseTime || '0'}ms`} delta="P99 1.1s" />
        </div>

        {/* Monitors Table */}
        <section className="mb-8">
          <h2 className="text-font text-xl font-bold text-ink mb-4">Monitors</h2>
          <DataTable
            columns={[
              { key: 'name', label: 'Monitor' },
              { key: 'type', label: 'Type' },
              { key: 'status', label: 'Status' },
              { key: 'health', label: 'Health' },
              { key: 'latency', label: 'Latency' },
              { key: 'lastProbed', label: 'Last Probe' },
              { key: 'actions', label: 'Actions' },
            ]}
            data={monitors}
          />
        </section>

        {/* Right Column - Incident Feed */}
        <section className="mt-8">
          <h2 className="text-font text-xl font-bold text-ink mb-4">Incident Feed</h2>
          <div className="space-y-4">
            {incidents && incidents.length > 0 ? (
              incidents.map((inc, i) => (
                <div key={i} className="pill-bad bg-red-100 text-red-800 rounded-full text-xs px-2 py-1 mb-1">
                  {inc.title}
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-sm">No active incidents</p>
            )}
          </div>
        </section>

        {/* Right Column - Dependency Warnings */}
        <section className="mt-8">
          <h2 className="text-font text-xl font-bold text-ink mb-4">Dependency Warnings</h2>
          {deps && deps.length > 0 ? (
            <div className="space-y-2">
              {deps.map((d, i) => (
                <div key={i} className="pill-warn bg-amber-50 border border-amber-200 rounded-full text-xs px-3 py-1">
                  {d}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No dependency warnings</p>
          )}
        </section>
      </main>
    </AppLayout>
  )
}