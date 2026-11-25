// UI States — context.md §5.12 (empty / loading / error patterns reference)

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, Skeleton, EmptyState, ErrorState, Pill } from '../components'
import { get } from '../lib/api'

const PROBE_ROWS = [
  { id: 1, monitor: 'REST Countries API', state: 'Comparing', status: 'queued' },
  { id: 2, monitor: 'JSONPlaceholder', state: 'Probing', status: 'running' },
  { id: 3, monitor: 'Open-Meteo Site', state: 'Queued', status: 'queued' },
]

export default function UIStates() {
  const navigate = useNavigate()
  const [live, setLive] = useState('idle') // idle | checking | error

  const checkLive = async () => {
    setLive('checking')
    try {
      await get('/monitors')
      setLive('idle')
      navigate('/dashboard')
    } catch {
      setLive('error')
    }
  }

  return (
    <AppLayout dataPage="states">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">UI States</h1>
        <p className="text-slate-500 text-sm mt-1">Reference patterns: empty · loading · error</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Empty */}
        <section className="card" aria-label="Empty state">
          <div className="flex items-center gap-2 mb-4">
            <Pill variant="neutral">EMPTY</Pill>
            <span className="text-xs text-slate-400">no data</span>
          </div>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <EmptyState
              title="No monitors yet"
              description="Add your first monitor to start monitoring"
              actionLabel="Add Monitor"
              onAction={() => navigate('/onboarding')}
            />
          </div>
        </section>

        {/* Loading */}
        <section className="card" aria-label="Loading state">
          <div className="flex items-center gap-2 mb-4">
            <Pill variant="warn">LOADING</Pill>
            <span className="text-xs text-slate-400">running probes…</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-sm text-slate-500 mb-3">Running probes…</p>
            <Skeleton lines={2} />
            <table className="table-base mt-3 bg-white">
              <thead>
                <tr><th>MONITOR</th><th>STATE</th></tr>
              </thead>
              <tbody>
                {PROBE_ROWS.map((r) => (
                  <tr key={r.id}>
                    <td className="text-sm">{r.monitor}</td>
                    <td>
                      <span className={r.status === 'running' ? 'pill-warn' : 'pill-neutral'}>
                        {r.status === 'running' ? '● ' : ''}{r.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Error */}
        <section className="card" aria-label="Error state">
          <div className="flex items-center gap-2 mb-4">
            <Pill variant="bad">ERROR</Pill>
            <span className="text-xs text-slate-400">api unreachable</span>
          </div>
          <div className="rounded-xl border border-dashed border-red-200 bg-red-50/40">
            {live === 'checking' ? (
              <div className="py-8 text-center text-sm text-slate-500">Retrying…</div>
            ) : (
              <ErrorState onRetry={checkLive} />
            )}
          </div>
          <p className="text-xs text-slate-400 mt-3 text-center">
            Retry re-checks the API — success returns to the dashboard.
          </p>
        </section>
      </div>
    </AppLayout>
  )
}
