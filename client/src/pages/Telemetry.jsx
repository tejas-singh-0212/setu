// Telemetry & Performance — context.md §5.7 (Part 3). Ported from v1 latency.html.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, StatCard, Pill, Skeleton, ErrorState, EmptyState, Overlay } from '../components'
import { get, post } from '../lib/api'

const RANGES = ['1h', '6h', '24h', '7d']

const fmtMs = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString()}ms`)
const fmtPct = (n) => (n === null || n === undefined ? '—' : `${n}%`)

function fmtTime(iso, range) {
  const d = new Date(iso)
  if (range === '7d') return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------- p99 curve (inline SVG) ----------

const W = 800
const H = 260
const X0 = 60
const X1 = 780
const Y0 = 20
const Y1 = 230

function niceMax(v) {
  const step = 400
  return Math.max(step * 4, Math.ceil(v / step) * step)
}

function TelemetryCurve({ curve, threshold, range }) {
  const [hover, setHover] = useState(null)
  const maxP99 = Math.max(0, ...curve.map((c) => c.p99 || 0))
  const yMax = niceMax(Math.max(maxP99, threshold) * 1.1)
  const x = (i) => X0 + (curve.length === 1 ? 0 : (i / (curve.length - 1)) * (X1 - X0))
  const y = (v) => Y1 - (v / yMax) * (Y1 - Y0)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f))
  const thresholdY = y(threshold)

  // Break the line where a bucket has no probes.
  const segments = []
  let current = []
  curve.forEach((c, i) => {
    if (c.p99 === null) {
      if (current.length) segments.push(current)
      current = []
    } else current.push(`${x(i).toFixed(1)},${y(c.p99).toFixed(1)}`)
  })
  if (current.length) segments.push(current)

  const labelIdx = [0, 6, 12, 18, curve.length - 1].filter((i) => i < curve.length)
  const bucketW = (X1 - X0) / Math.max(1, curve.length - 1)
  const hovered = hover !== null ? curve[hover] : null
  const breaches = curve.filter((c) => c.breached).length

  return (
    <div className="relative mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`p99 latency over the last ${range}. ${breaches} of ${curve.length} intervals above the ${threshold.toLocaleString()}ms threshold.`}
        onMouseLeave={() => setHover(null)}
      >
        <rect x={X0} y={Y0} width={X1 - X0} height={Math.max(0, thresholdY - Y0)} className="fill-bad/5" />
        <text x={X0 + 10} y={Y0 + 18} className="fill-bad text-[11px] font-bold tracking-wider">
          DEGRADED ZONE (&gt;{threshold.toLocaleString()}ms)
        </text>

        <g className="stroke-slate-200" strokeWidth="1">
          {ticks.map((t, i) => (
            <line key={t} x1={X0} y1={y(t)} x2={X1} y2={y(t)} strokeDasharray={i === 0 ? undefined : '2 4'} />
          ))}
        </g>
        <g className="fill-muted text-[11px]" textAnchor="end">
          {ticks.map((t) => (
            <text key={t} x={X0 - 10} y={y(t) + 4}>{t.toLocaleString()}ms</text>
          ))}
        </g>
        <g className="fill-muted text-[11px]" textAnchor="middle">
          {labelIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 10}>{fmtTime(curve[i].t, range)}</text>
          ))}
        </g>

        <line x1={X0} y1={thresholdY} x2={X1} y2={thresholdY} className="stroke-bad" strokeWidth="1.5" strokeDasharray="6 5" />

        {segments.map((pts, i) => (
          <polyline key={i} fill="none" className="stroke-brand" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={pts.join(' ')} />
        ))}
        {segments.map((pts, i) =>
          pts.length === 1 ? (
            <circle key={`s${i}`} cx={pts[0].split(',')[0]} cy={pts[0].split(',')[1]} r="3" className="fill-brand" />
          ) : null
        )}

        {curve.map((c, i) =>
          c.breached ? (
            <g key={`b${i}`}>
              <circle cx={x(i)} cy={y(c.p99)} r="8" className="fill-bad/20" />
              <circle cx={x(i)} cy={y(c.p99)} r="4.5" className="fill-bad stroke-white" strokeWidth="2" />
            </g>
          ) : null
        )}

        {hovered && hovered.p99 !== null && (
          <line x1={x(hover)} y1={Y0} x2={x(hover)} y2={Y1} className="stroke-slate-300" strokeDasharray="3 3" />
        )}

        {/* hover targets */}
        {curve.map((c, i) => (
          <rect
            key={`h${i}`}
            x={x(i) - bucketW / 2}
            y={Y0}
            width={bucketW}
            height={Y1 - Y0}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hovered && (
        <div
          className={`absolute top-2 card !p-3 shadow-lg text-xs pointer-events-none ${hovered.breached ? 'border-bad/40' : ''}`}
          style={{ left: `${Math.min(75, (x(hover) / W) * 100)}%` }}
        >
          <p className="font-semibold text-muted">
            {fmtTime(hovered.t, range)}
            {hovered.breached && <span className="text-bad"> · p99 breach</span>}
          </p>
          <p className={`text-base font-bold mt-0.5 ${hovered.breached ? 'text-bad' : 'text-ink'}`}>{hovered.p99 === null ? 'No probes' : fmtMs(hovered.p99)}</p>
          <p className="text-muted">{hovered.count} probe{hovered.count === 1 ? '' : 's'}</p>
        </div>
      )}

      <ul className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-sm text-muted">
        <li className="flex items-center gap-2"><span className="w-5 h-0.5 bg-brand rounded" aria-hidden="true" />p99 Response Curve</li>
        <li className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-bad" aria-hidden="true" />SLA Threshold ({threshold.toLocaleString()}ms)</li>
        <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-bad" aria-hidden="true" />Breach</li>
      </ul>
    </div>
  )
}

// ---------- Remedy approval overlay ----------

const REMEDY_LABELS = { timeout: 'Increase client timeout', retry: 'Add retry with exponential backoff', cache: 'Cache idempotent responses' }

function RemedyOverlay({ remedy, alert, onClose, onDone }) {
  const [state, setState] = useState({ step: 'confirm', error: null })

  const apply = async () => {
    setState({ step: 'running', error: null })
    try {
      // Part 2 recovery flow: propose → approve (human gate) → verify (post-check).
      const action = await post('/api/recovery', { incidentId: alert.incidentId, kind: remedy.kind, payload: remedy.payload })
      await post(`/api/recovery/${action.id}/approve`)
      const verified = await post(`/api/recovery/${action.id}/verify`)
      setState({ step: 'done', error: null, verified })
      onDone && onDone()
    } catch (e) {
      const msg = e.status === 404 ? 'The recovery service is not available yet.' : e.message
      setState({ step: 'confirm', error: msg })
    }
  }

  return (
    <Overlay isOpen onClose={onClose}>
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <Pill variant="warn">Approval required</Pill>
          <h2 className="text-xl font-bold text-ink mt-3">{REMEDY_LABELS[remedy.kind]}</h2>
          <p className="text-sm text-muted mt-1">
            {alert.monitorName} · <span className="font-mono">{remedy.summary}</span>
          </p>
        </div>
        <button type="button" className="btn-secondary !p-2" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Pill variant="neutral">Dry-run first</Pill>
        <Pill variant="neutral">Post-check enabled</Pill>
      </div>
      <p className="text-sm text-muted mt-4">
        Setu runs this config change as a dry-run, then applies it and runs a post-check probe to verify recovery.
      </p>

      {state.error && <p className="text-sm text-bad mt-4" role="alert">{state.error}</p>}
      {state.step === 'done' && (
        <p className="text-sm text-ok mt-4" role="status">
          Remedy approved and executed. {state.verified?.postCheckOk === false ? 'Post-check failed — see History.' : 'Post-check passed.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mt-6">
        <button type="button" className="btn-secondary w-full" onClick={onClose}>
          {state.step === 'done' ? 'Close' : 'Cancel'}
        </button>
        {state.step !== 'done' && (
          <button type="button" className="btn-primary w-full" onClick={apply} disabled={state.step === 'running'}>
            {state.step === 'running' ? 'Applying…' : 'Approve & Apply'}
          </button>
        )}
      </div>
    </Overlay>
  )
}

// ---------- Page ----------

export default function Telemetry() {
  const navigate = useNavigate()
  const [range, setRange] = useState('24h')
  const [monitorId, setMonitorId] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [remedy, setRemedy] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ range })
      if (monitorId) qs.set('monitor', monitorId)
      setData(await get(`/api/telemetry?${qs}`))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [range, monitorId])

  useEffect(() => { load() }, [load])

  const alertMonitor = useMemo(
    () => data?.monitors.find((m) => m.id === data.alert.monitorId) || null,
    [data]
  )

  if (error) {
    return <AppLayout dataPage="telemetry"><ErrorState onRetry={load} /></AppLayout>
  }
  if (!data) {
    return (
      <AppLayout dataPage="telemetry">
        <div className="space-y-6">
          <Skeleton lines={2} width="40%" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} type="card" />)}
          </div>
          <Skeleton type="card" />
        </div>
      </AppLayout>
    )
  }
  if (!data.monitors.length) {
    return (
      <AppLayout dataPage="telemetry">
        <EmptyState title="No monitors yet" description="Add a monitor to start collecting telemetry." actionLabel="Add Monitor" onAction={() => navigate('/onboarding')} />
      </AppLayout>
    )
  }

  const { stats, curve, alert, slowCalls, threshold } = data
  const hasProbes = stats.total > 0
  const timeout = alertMonitor?.timeout_ms ?? 5000
  const remedies = [
    {
      key: 'A', kind: 'timeout', title: 'Increase Client Timeout',
      summary: `Timeout: ${timeout.toLocaleString()}ms → ${(timeout * 2).toLocaleString()}ms`,
      payload: { timeoutMs: timeout * 2 },
      body: 'Give slow upstream calls more headroom before the client aborts, preventing premature timeouts.',
      cta: 'Configure Timeout',
    },
    {
      key: 'B', kind: 'retry', title: 'Add Retry with Exponential Backoff',
      summary: '3 retries · jittered 200ms',
      payload: { retries: 3, backoff: 'exponential', jitterMs: 200 },
      body: "Automatically retry transient slow or failed calls with growing, jittered delays so bursts don't overload the upstream.",
      cta: 'Configure Retry Policy',
    },
    {
      key: 'C', kind: 'cache', title: 'Cache Idempotent Responses',
      summary: 'Cache TTL: 120s',
      payload: { cacheEnabled: true, ttlSec: 120 },
      body: 'Serve repeated idempotent GET responses from cache, removing the slow upstream from the hot path.',
      recommended: true,
    },
  ]

  return (
    <AppLayout dataPage="telemetry">
      <div className="space-y-6 pb-12">
        {/* 1. Header */}
        <section className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-muted uppercase">Telemetry / Real-time synthetics</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1 text-ink">Telemetry &amp; Performance</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-surface border border-slate-200 rounded-lg p-1" role="group" aria-label="Time range">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={r === range}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 text-sm rounded-md ${r === range ? 'font-semibold bg-brand text-white' : 'font-medium text-muted hover:text-ink'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="monitor-select">Monitor</label>
            <select
              id="monitor-select"
              value={monitorId}
              onChange={(e) => setMonitorId(e.target.value)}
              className="bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All monitors</option>
              {data.monitors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <Pill variant={loading ? 'neutral' : 'ok'}>{loading ? 'Refreshing…' : '● Live'}</Pill>
          </div>
        </section>

        {/* 2. Stat cards */}
        <section aria-label="Latency statistics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="CURRENT P50 LATENCY" value={fmtMs(stats.p50)}>
            <Pill variant={stats.p50 !== null && stats.p50 > threshold ? 'bad' : 'ok'}>
              {stats.p50 !== null && stats.p50 > threshold ? '● Degraded' : '● Normal'}
            </Pill>
          </StatCard>
          <StatCard label="CURRENT P99 LATENCY" value={fmtMs(stats.p99)}>
            <Pill variant={stats.p99 !== null && stats.p99 > threshold ? 'bad' : 'ok'}>
              {stats.p99 !== null && stats.p99 > threshold ? '● Degraded' : '● Normal'}
            </Pill>{' '}
            <span>Threshold: {fmtMs(threshold)}</span>
          </StatCard>
          <StatCard label={`SLA BREACHES (${range.toUpperCase()})`} value={`${stats.slaBreaches} events`}>
            <Pill variant={stats.slaCompliance === null || stats.slaCompliance >= 99.9 ? 'ok' : 'warn'}>
              {fmtPct(stats.slaCompliance)} Compliant
            </Pill>{' '}
            <span>Target: 99.9%</span>
          </StatCard>
          <StatCard label="ERROR / TIMEOUT RATE" value={fmtPct(stats.errorRate)}>
            <Pill variant={stats.errorRate === null || stats.errorRate <= 0.5 ? 'ok' : 'bad'}>
              {stats.errorRate === null || stats.errorRate <= 0.5 ? '● Within Budget' : '● Over Budget'}
            </Pill>{' '}
            <span>Max allowed: 0.5%</span>
          </StatCard>
        </section>

        {/* 3. Curve */}
        <section className="card" aria-labelledby="curve-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="curve-title" className="text-lg font-semibold text-ink">{range === '7d' ? '7-Day' : range.toUpperCase()} Telemetry Curve</h2>
            <Pill variant="neutral">Percentile 99</Pill>
          </div>
          {hasProbes ? (
            <TelemetryCurve curve={curve} threshold={threshold} range={range} />
          ) : (
            <p className="text-sm text-muted py-12 text-center">No probes recorded in the last {range}.</p>
          )}
        </section>

        {/* 4. Active alert */}
        {alert.active ? (
          <section className="card !p-5 border-bad/40 bg-bad/5" role="alert">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-bad/10 text-bad flex items-center justify-center font-bold" aria-hidden="true">!</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">
                    Active Alert: {alert.consecutive} Consecutive Slow Calls Exceeding {fmtMs(alert.threshold)}
                  </h2>
                  <Pill variant="bad">Critical P1</Pill>
                </div>
                <p className="text-sm text-muted mt-1">
                  {alert.monitorName} <code className="font-mono text-ink bg-slate-100 px-1.5 py-0.5 rounded">{alert.url}</code> is
                  over the latency threshold (trigger: {alert.trigger} consecutive calls).
                </p>
              </div>
              {alert.incidentId && (
                <button type="button" className="btn-secondary shrink-0" onClick={() => navigate('/incidents')}>
                  Open incident
                </button>
              )}
            </div>
          </section>
        ) : (
          <section className="card !p-5" role="status">
            <div className="flex items-center gap-3">
              <Pill variant="ok">● No active alert</Pill>
              <p className="text-sm text-muted">
                No monitor has {alert.trigger}+ consecutive calls over {fmtMs(alert.threshold)}.
              </p>
            </div>
          </section>
        )}

        {/* 5. Remedies */}
        <section aria-label="Suggested remedies" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {remedies.map((r) => (
            <article key={r.key} className={`card flex flex-col ${r.recommended ? 'border-ai/40 ring-1 ring-ai/20' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold tracking-wider text-muted">REMEDY {r.key}</p>
                {r.recommended && <Pill variant="ai">✦ Recommended</Pill>}
              </div>
              <h3 className="text-lg font-semibold mt-1 text-ink">{r.title}</h3>
              <p className="font-mono text-sm mt-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{r.summary}</p>
              <p className="text-sm text-muted mt-3 flex-1">{r.body}</p>
              {r.recommended ? (
                <>
                  <button
                    type="button"
                    className="btn-primary mt-5 disabled:opacity-50"
                    disabled={!alert.incidentId}
                    onClick={() => setRemedy(r)}
                  >
                    ⚡ Apply Remedy
                  </button>
                  {!alert.incidentId && <p className="text-xs text-muted mt-2">No open latency incident to recover.</p>}
                </>
              ) : (
                <button type="button" className="btn-secondary mt-5" onClick={() => navigate('/settings')}>{r.cta}</button>
              )}
            </article>
          ))}
        </section>

        {/* 6. Slow-call log */}
        <section className="card !p-0 overflow-hidden" aria-labelledby="log-title">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <h2 id="log-title" className="text-lg font-semibold text-ink">Slow-Call Log</h2>
              <Pill variant="neutral">Last 50 calls &gt; 800ms</Pill>
            </div>
          </div>
          {slowCalls.length === 0 ? (
            <p className="text-sm text-muted p-6 text-center">No calls slower than 800ms in the last {range}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base !border-0">
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Monitor</th>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Duration</th>
                    <th scope="col">HTTP Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {slowCalls.map((c) => {
                    const failed = !c.ok
                    const open = expanded === c.id
                    return [
                      <tr key={c.id} className={failed ? 'bg-bad/5' : ''}>
                        <td className="font-mono">{new Date(c.at).toLocaleString()}</td>
                        <td>{c.monitorName}</td>
                        <td className="font-mono text-muted max-w-xs truncate" title={c.url}>{c.url}</td>
                        <td className={`font-mono font-semibold ${c.latencyMs > threshold ? 'text-bad' : 'text-warn'}`}>{fmtMs(c.latencyMs)}</td>
                        <td><Pill variant={failed ? 'bad' : 'ok'}>{c.statusCode || 'No response'}</Pill></td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary !py-1.5 !px-3 !text-xs"
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : c.id)}
                          >
                            {open ? 'Hide Details' : 'View Details'}
                          </button>
                        </td>
                      </tr>,
                      open && (
                        <tr key={`${c.id}-d`} className="bg-slate-50">
                          <td colSpan={6}>
                            <dl className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                              <div><dt className="text-muted text-xs">Probe ID</dt><dd className="font-mono">{c.id}</dd></div>
                              <div><dt className="text-muted text-xs">Over threshold by</dt><dd className="font-mono">{c.latencyMs > threshold ? fmtMs(c.latencyMs - threshold) : 'Under threshold'}</dd></div>
                              <div><dt className="text-muted text-xs">Result</dt><dd>{c.ok ? 'Succeeded (slow)' : 'Failed'}</dd></div>
                              <div><dt className="text-muted text-xs">Error</dt><dd className="font-mono">{c.error || '—'}</dd></div>
                            </dl>
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {remedy && <RemedyOverlay remedy={remedy} alert={alert} onClose={() => setRemedy(null)} onDone={load} />}
    </AppLayout>
  )
}
