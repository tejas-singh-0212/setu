// Monitors — context.md §5.4 (CRUD actions wired to the real API)

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, Skeleton, EmptyState, ErrorState, Pill, Modal } from '../components'
import { get, patch, del, post } from '../lib/api'

const fmtInterval = (s) => (s >= 60 ? (s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}m ${s % 60}s`) : `${s}s`)
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—')

export default function Monitors() {
  const navigate = useNavigate()
  const [monitors, setMonitors] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // id of monitor being actioned
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setMonitors(await get('/monitors'))
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id, fn) => {
    setBusy(id)
    try {
      await fn()
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (error) return <AppLayout dataPage="monitors"><div className="card"><ErrorState onRetry={load} /></div></AppLayout>
  if (!monitors) {
    return (
      <AppLayout dataPage="monitors">
        <div className="space-y-4">
          <Skeleton lines={2} width="40%" />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} type="tableRow" />)}
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout dataPage="monitors">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Monitors</h1>
          <p className="text-slate-500 text-sm mt-1">Registered websites &amp; REST APIs</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/onboarding')}>+ Add Monitor</button>
      </div>

      {!monitors.length ? (
        <div className="card">
          <EmptyState
            title="No monitors yet"
            description="Add a monitor to start probing uptime, latency, schema and certificates."
            actionLabel="Add Monitor"
            onAction={() => navigate('/onboarding')}
          />
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>NAME</th><th>TYPE</th><th>URL</th><th>INTERVAL</th>
                  <th>STATUS</th><th>HEALTH</th><th>LAST EDITED</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((row) => (
                  <tr key={row.id} className={busy === row.id ? 'opacity-60' : ''}>
                    <td className="font-semibold text-ink">{row.name}</td>
                    <td><Pill variant={row.type === 'api' ? 'neutral' : 'ok'}>{row.type.toUpperCase()}</Pill></td>
                    <td className="font-mono text-xs text-slate-500 max-w-[260px] truncate" title={row.url}>{row.url}</td>
                    <td className="text-sm">{fmtInterval(row.intervalSec)}</td>
                    <td>
                      <Pill variant={row.status === 'active' ? 'ok' : 'neutral'}>
                        {row.status === 'active' ? '● Active' : '● Paused'}
                      </Pill>
                    </td>
                    <td className={`font-semibold ${row.healthScore >= 90 ? 'text-ok' : row.healthScore >= 75 ? 'text-warn' : 'text-bad'}`}>
                      {row.healthScore}%
                    </td>
                    <td className="text-sm text-slate-500">{fmtDate(row.createdAt)}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <button
                          className="btn-secondary text-xs !py-1 !px-2"
                          disabled={busy === row.id}
                          onClick={() => act(row.id, () => patch(`/monitors/${row.id}`, { status: row.status === 'active' ? 'paused' : 'active' }))}
                        >
                          {row.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          className="btn-secondary text-xs !py-1 !px-2"
                          disabled={busy === row.id}
                          onClick={() => act(row.id, () => post(`/monitors/${row.id}/probe`))}
                          title="Run one probe now"
                        >
                          Probe now
                        </button>
                        <button
                          className="btn-danger text-xs !py-1 !px-2"
                          disabled={busy === row.id}
                          onClick={() => setToDelete(row)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="px-5 py-3 border-t border-slate-100 text-right text-sm text-slate-500">
            {monitors.length} of {monitors.length} monitors · {monitors.filter((m) => m.status === 'active').length} probing active
          </footer>
        </div>
      )}

      <Modal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete monitor?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setToDelete(null)}>Cancel</button>
            <button
              className="btn-danger"
              disabled={busy === toDelete?.id}
              onClick={async () => {
                await act(toDelete.id, () => del(`/monitors/${toDelete.id}`))
                setToDelete(null)
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-ink">{toDelete?.name}</span> and its probes, incidents and
          dependency checks will be removed. This cannot be undone.
        </p>
      </Modal>
    </AppLayout>
  )
}
