// Incidents — context.md §5.5 (filters, table, inline expand with diagnosis
// + approval-gated recovery; drift rows route to /diff)

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, Skeleton, EmptyState, ErrorState, Pill, Modal } from '../components'
import { get, post } from '../lib/api'

const TYPE_VARIANT = { drift: 'bad', latency: 'warn', error: 'bad', dependency: 'warn' }
const STATUS_VARIANT = { open: 'bad', diagnosing: 'warn', recovering: 'warn', resolved: 'ok', failed: 'bad' }
const SEVERITY_VARIANT = { high: 'bad', medium: 'warn', low: 'neutral' }
const KIND_OPTIONS = [
  { kind: 'retry', label: 'Add retry (exponential backoff)', payload: { retries: 2, backoff: 'exponential' } },
  { kind: 'timeout', label: 'Increase timeout to 10s', payload: { timeoutMs: 10000 } },
  { kind: 'cache', label: 'Enable response cache', payload: {} },
]

const fmtTime = (iso) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const EVENT_LABEL = {
  detected: 'Detected',
  diagnosis: 'Diagnosis',
  proposed: 'Proposed',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
  postcheck: 'Post-check',
  note: 'Note',
}

function Timeline({ events }) {
  const order = ['detected', 'diagnosis', 'proposed', 'approved', 'executed', 'postcheck', 'rejected', 'note']
  const sorted = [...events].sort((a, b) => new Date(a.at) - new Date(b.at))
  return (
    <ol className="relative border-l-2 border-slate-100 ml-2 space-y-4 py-1">
      {sorted.map((e) => (
        <li key={e.id} className="ml-4 relative">
          <span
            className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${
              e.kind === 'postcheck' && e.payload?.passed ? 'bg-ok'
              : e.kind === 'rejected' ? 'bg-bad'
              : e.kind === 'executed' || e.kind === 'approved' ? 'bg-brand'
              : 'bg-slate-400'
            }`}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-ink">
            {EVENT_LABEL[e.kind] || e.kind}
            <span className="font-normal text-slate-400"> · {fmtTime(e.at)}</span>
          </p>
          <p className="text-xs text-slate-500">
            {e.kind === 'postcheck'
              ? (e.payload?.passed ? 'Post-check probe passed — recovery verified' : 'Post-check probe failed')
              : e.actor ? `by ${e.actor === 'system' ? 'Setu' : e.actor}` : ''}
          </p>
        </li>
      ))}
    </ol>
  )
}

function RecoveryPanel({ incident, onDone }) {
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async (opt) => {
    setBusy(true)
    setError(null)
    try {
      const action = await post('/recovery', { incidentId: incident.id, kind: opt.kind, payload: opt.payload })
      await post(`/recovery/${action.id}/approve`)
      const verified = await post(`/recovery/${action.id}/verify`)
      setChoosing(false)
      onDone(verified)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-primary text-sm" onClick={() => setChoosing(true)} disabled={incident.status === 'resolved'}>
          Apply recovery…
        </button>
        <span className="pill-neutral self-center">Dry-run first · approval required</span>
      </div>

      <Modal isOpen={choosing} onClose={() => setChoosing(false)} title="Choose a recovery action">
        <p className="text-sm text-slate-500 mb-4">
          Config-level fixes only. You approve — Setu executes and runs a post-check probe.
        </p>
        <div className="space-y-2">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              className="w-full text-left rounded-lg border border-slate-200 px-4 py-3 hover:border-brand hover:bg-brand/5 transition-colors disabled:opacity-50"
              disabled={busy}
              onClick={() => run(opt)}
            >
              <span className="text-sm font-semibold text-ink">{opt.label}</span>
              <span className="block text-xs text-slate-500 mt-0.5">Dry-run first · post-check enabled</span>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-bad mt-3" role="alert">{error}</p>}
        <p className="text-xs text-slate-400 mt-4">
          {busy ? 'Approving & running post-check…' : 'Safety limits apply (max 3 actions/hour).'}
        </p>
      </Modal>
    </>
  )
}

function ExpandedRow({ incidentId, onClose, onRecovered }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const d = await get(`/incidents/${incidentId}`)
        if (alive) setDetail(d)
      } catch (e) {
        if (alive) setError(e)
      }
    })()
    return () => { alive = false }
  }, [incidentId])

  if (error) return <div className="px-4 py-4"><ErrorState onRetry={() => setError(null)} /></div>
  if (!detail) return <div className="px-4 py-4"><Skeleton lines={4} /></div>

  const { incident, events, actions } = detail
  const diagnosis = incident.diagnosis

  return (
    <div className="bg-slate-50/70 px-5 py-5 border-b border-slate-100 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Timeline</h4>
        {events.length ? <Timeline events={events} /> : <p className="text-sm text-slate-500">No events yet.</p>}
      </div>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Diagnosis</h4>
            {diagnosis?.llm && <Pill variant="ai">AI · LLM + RAG</Pill>}
          </div>
          {diagnosis?.summary ? (
            <>
              <p className="text-sm text-ink leading-relaxed">{diagnosis.summary}</p>
              <p className="text-xs text-slate-500 mt-2">
                Confidence {Math.round((diagnosis.confidence || 0) * 100)}%
                {diagnosis.ragUsed ? ` · RAG: ${diagnosis.ragUsed} similar incidents` : ' · rules-only'}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Diagnosis pending…</p>
          )}
        </div>

        {actions.filter((a) => a.status === 'pending').map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Pending: {a.kind}</p>
              <p className="text-xs text-slate-500">Waiting for your approval</p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={async () => { await post(`/recovery/${a.id}/reject`); onRecovered() }}
              >
                Reject
              </button>
              <button
                className="btn-primary text-xs"
                onClick={async () => {
                  await post(`/recovery/${a.id}/approve`)
                  await post(`/recovery/${a.id}/verify`)
                  onRecovered()
                }}
              >
                Approve & verify
              </button>
            </div>
          </div>
        ))}

        <RecoveryPanel incident={incident} onDone={onRecovered} />
      </div>
    </div>
  )
}

export default function Incidents() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [range, setRange] = useState('7d')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = new URLSearchParams({ range, type, status })
      if (q.trim()) qs.set('q', q.trim())
      setRows(await get(`/incidents?${qs}`))
    } catch (e) {
      setError(e)
    }
  }, [range, type, status, q])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const grouped = useMemo(() => rows || [], [rows])

  if (error) return <AppLayout dataPage="incidents"><div className="card"><ErrorState onRetry={load} /></div></AppLayout>
  if (!rows) {
    return (
      <AppLayout dataPage="incidents">
        <div className="space-y-4">
          <Skeleton lines={2} width="35%" />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} type="tableRow" />)}
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout dataPage="incidents">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-ink">Incidents</h1>
          <p className="text-slate-500 text-sm mt-1">
            {grouped.length} incident{grouped.length === 1 ? '' : 's'} in the selected window
          </p>
        </div>
        <input
          type="search"
          placeholder="Search monitor or cause…"
          aria-label="Search incidents"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input-base rounded-lg border border-slate-300 py-2 px-3 text-sm w-64"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-5">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Window
          <select className="input-base rounded-lg border border-slate-300 py-1.5 px-2 text-sm" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Type
          <select className="input-base rounded-lg border border-slate-300 py-1.5 px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All</option>
            <option value="drift">Drift</option>
            <option value="latency">Latency</option>
            <option value="error">Error</option>
            <option value="dependency">Dependency</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Status
          <select className="input-base rounded-lg border border-slate-300 py-1.5 px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="diagnosing">Diagnosing</option>
            <option value="recovering">Recovering</option>
            <option value="resolved">Resolved</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>

      {notice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          <span>✓ {notice}</span>
          <button className="font-semibold" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {!grouped.length ? (
        <div className="card">
          <EmptyState
            title="No incidents here"
            description="Nothing matched the current filters — probes are running continuously."
            actionLabel="Back to dashboard"
            onAction={() => navigate('/dashboard')}
          />
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>TIME</th><th>MONITOR</th><th>TYPE</th><th>SEVERITY</th>
                  <th>PROBABLE CAUSE</th><th>STATUS</th><th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((inc) => {
                  const isDrift = inc.type === 'drift'
                  const isOpen = expanded === inc.id
                  return (
                    <Fragment key={inc.id}>
                      <tr className={isOpen ? 'bg-slate-50' : ''}>
                        <td className="text-sm text-slate-500 whitespace-nowrap">{fmtTime(inc.openedAt)}</td>
                        <td className="font-semibold text-ink text-sm">{inc.monitorName}</td>
                        <td><Pill variant={TYPE_VARIANT[inc.type] || 'neutral'}>{inc.type}</Pill></td>
                        <td><Pill variant={SEVERITY_VARIANT[inc.severity] || 'neutral'}>{inc.severity}</Pill></td>
                        <td className="text-sm text-slate-600 max-w-[280px]">{inc.probableCause || '—'}</td>
                        <td><Pill variant={STATUS_VARIANT[inc.status] || 'neutral'}>{inc.status}</Pill></td>
                        <td>
                          {isDrift ? (
                            <button className="btn-primary text-xs !py-1 !px-3" onClick={() => navigate(`/diff/${inc.id}`)}>
                              Review →
                            </button>
                          ) : (
                            <button
                              className="btn-secondary text-xs !py-1 !px-3"
                              onClick={() => setExpanded(isOpen ? null : inc.id)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? 'Close' : 'Open →'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {!isDrift && isOpen && (
                        <tr>
                          <td colSpan={7} className="!p-0">
                            <ExpandedRow
                              incidentId={inc.id}
                              onDone={() => {
                                setNotice('Recovery verified — post-check passed.')
                                setExpanded(null)
                                load()
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
