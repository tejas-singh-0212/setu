// History & Reports — context.md §5.10 (Part 3).
// Section B (Reports) on top, Section A (schema history + rollback, ported from v1 history.html) below.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, StatCard, Pill, Skeleton, ErrorState, Overlay } from '../components'
import { get, post } from '../lib/api'

const REPORT_RANGES = ['7d', '30d', '90d']
const TYPE_PILL = { drift: 'bad', latency: 'warn', error: 'bad', dependency: 'warn' }

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const fmtMinutes = (m) => (m === null || m === undefined ? '—' : `${m}m`)
const fieldsOf = (v) => {
  const f = v?.schema?.fields
  if (Array.isArray(f)) return f
  if (f && typeof f === 'object') return Object.keys(f)
  return []
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv(rows, range) {
  const header = ['Date', 'Monitor', 'Type', 'Severity', 'Status', 'Diagnosis', 'Action taken', 'Post-check', 'Duration (min)']
  const lines = rows.map((r) => [
    new Date(r.openedAt).toISOString(), r.monitorName, r.type, r.severity, r.status, r.diagnosis,
    r.action ? `${r.action.kind} (${r.action.status})` : '',
    r.postCheck === null ? '' : r.postCheck ? 'pass' : 'fail',
    r.durationMinutes ?? '',
  ].map(csvCell).join(','))
  downloadFile(`setu-report-${range}.csv`, [header.join(','), ...lines].join('\n'), 'text/csv')
}

// ---------- Recovery effectiveness chart (intelligent vs static) ----------

function EffectivenessChart({ effectiveness }) {
  const bars = [
    { label: 'Intelligent recovery', value: effectiveness.intelligent, className: 'fill-brand' },
    { label: 'Static rules', value: effectiveness.static, className: 'fill-slate-400' },
  ]
  const X0 = 170
  const X1 = 700
  return (
    <div>
      <svg
        viewBox="0 0 760 130"
        className="w-full h-auto"
        role="img"
        aria-label={`Recovery success rate: intelligent recovery ${effectiveness.intelligent}%, static rules ${effectiveness.static}%.`}
      >
        <g className="stroke-slate-200" strokeWidth="1">
          {[0, 25, 50, 75, 100].map((t) => (
            <line key={t} x1={X0 + ((X1 - X0) * t) / 100} y1="10" x2={X0 + ((X1 - X0) * t) / 100} y2="104" strokeDasharray={t ? '2 4' : undefined} />
          ))}
        </g>
        <g className="fill-muted text-[11px]" textAnchor="middle">
          {[0, 25, 50, 75, 100].map((t) => <text key={t} x={X0 + ((X1 - X0) * t) / 100} y="122">{t}%</text>)}
        </g>
        {bars.map((b, i) => {
          const y = 18 + i * 44
          const w = ((X1 - X0) * Math.max(0, Math.min(100, b.value))) / 100
          return (
            <g key={b.label}>
              <text x={X0 - 12} y={y + 20} textAnchor="end" className="fill-ink text-[13px] font-medium">{b.label}</text>
              <rect x={X0} y={y} width={w} height="30" rx="6" className={b.className} />
              {w > 420 ? (
                <text x={X0 + w - 10} y={y + 20} textAnchor="end" className="fill-white text-[13px] font-bold">{b.value}% success</text>
              ) : (
                <text x={X0 + w + 8} y={y + 20} className="fill-ink text-[13px] font-bold">{b.value}% success</text>
              )}
            </g>
          )
        })}
      </svg>
      <p className="text-xs text-muted mt-2">
        {effectiveness.intelligentBasis === 'measured'
          ? `Intelligent: ${effectiveness.sample.verified} of ${effectiveness.sample.executed} executed recovery actions passed their post-check.`
          : 'Intelligent: benchmark value — no recovery actions were executed in this range yet.'}{' '}
        Static: {effectiveness.staticBasis}.
      </p>
    </div>
  )
}

// ---------- Section B: Reports ----------

function ReportsPanel() {
  const [range, setRange] = useState('7d')
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    setReport(null)
    try {
      setReport(await get(`/api/reports?range=${range}`))
    } catch (e) {
      setError(e)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  return (
    <section className="space-y-6" aria-labelledby="reports-title">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Maintenance history / Reports</p>
          <h1 id="reports-title" className="text-2xl md:text-3xl font-bold tracking-tight text-ink mt-1">History &amp; Reports</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-surface border border-slate-200 rounded-lg p-1" role="group" aria-label="Report range">
            {REPORT_RANGES.map((r) => (
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
          <button type="button" className="btn-secondary disabled:opacity-50" disabled={!report?.history.length} onClick={() => exportCsv(report.history, range)}>
            Export report (CSV)
          </button>
        </div>
      </div>

      {error ? (
        <div className="card"><ErrorState onRetry={load} /></div>
      ) : !report ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} type="card" />)}</div>
          <Skeleton type="card" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label={`INCIDENTS (${range.toUpperCase()})`} value={report.stats.incidents} />
            <StatCard label="AUTO-RECOVERED" value={report.stats.autoRecovered} />
            <StatCard label="MANUAL APPROVALS" value={report.stats.manualApprovals} />
            <StatCard label="MTTR" value={fmtMinutes(report.stats.mttrMinutes)}>
              {report.stats.mttrMinutes === null && 'No resolved incidents yet'}
            </StatCard>
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-ink">Recovery effectiveness</h2>
              <Pill variant="neutral">Last {range}</Pill>
            </div>
            <EffectivenessChart effectiveness={report.effectiveness} />
          </div>

          <div className="card !p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-ink">Incident history</h2>
              <Pill variant="neutral">{report.history.length} incident{report.history.length === 1 ? '' : 's'}</Pill>
            </div>
            {report.history.length === 0 ? (
              <p className="text-sm text-muted p-6 text-center">No incidents in the last {range}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base !border-0">
                  <thead>
                    <tr>
                      <th scope="col">DATE</th>
                      <th scope="col">MONITOR</th>
                      <th scope="col">TYPE</th>
                      <th scope="col">DIAGNOSIS</th>
                      <th scope="col">ACTION TAKEN</th>
                      <th scope="col">POST-CHECK</th>
                      <th scope="col">DURATION</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {report.history.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{fmtDate(r.openedAt)}</td>
                        <td className="font-medium text-ink">{r.monitorName}</td>
                        <td><Pill variant={TYPE_PILL[r.type] || 'neutral'}>{r.type}</Pill></td>
                        <td className="max-w-xs">{r.diagnosis || <span className="text-muted">—</span>}</td>
                        <td>{r.action ? <span className="font-mono text-xs">{r.action.kind} · {r.action.status}</span> : <span className="text-muted">None</span>}</td>
                        <td>
                          {r.postCheck === null ? <Pill variant="neutral">Not run</Pill> : r.postCheck ? <Pill variant="ok">Pass</Pill> : <Pill variant="bad">Fail</Pill>}
                        </td>
                        <td>{r.durationMinutes === null ? <span className="text-muted">{r.status}</span> : fmtMinutes(r.durationMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ---------- Section A: Schema history & rollback ----------

const EVENT = {
  expected: { label: 'Approved & Live', variant: 'ok' },
  superseded: { label: 'Superseded', variant: 'warn' },
}

function RollbackOverlay({ target, current, onClose }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const confirm = async () => {
    setBusy(true)
    setErr(null)
    try {
      await post(`/api/history/rollback/${target.id}`)
      navigate('/dashboard')
    } catch (e) {
      setErr('Rollback failed — nothing was changed. Try again.')
      setBusy(false)
    }
  }

  return (
    <Overlay isOpen onClose={onClose}>
      <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="flex-1">
          <Pill variant="warn">Rollback Verification</Pill>
          <h2 className="text-xl font-bold text-ink mt-3">Confirm Schema Rollback</h2>
          <p className="text-sm text-muted mt-2">Review the target snapshot before restoring the previous schema version.</p>
        </div>
        <button type="button" className="btn-secondary !p-2 shrink-0" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-muted mt-5 mb-3">Rollback Target</p>
      <div className="border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-ink font-mono">#{target.id.slice(-8)}</p>
            <p className="text-sm text-muted mt-1">{target.monitorName}</p>
          </div>
          <Pill variant="warn">{target.version}</Pill>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-200">
          <div>
            <p className="text-xs text-muted">Current Version</p>
            <p className="text-sm font-semibold text-ink mt-1">{current?.version || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Target Version</p>
            <p className="text-sm font-semibold text-ink mt-1">{target.version}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 border border-warn rounded-xl p-4">
        <p className="text-sm font-semibold text-ink">Review before proceeding</p>
        <p className="text-xs text-muted mt-2">
          This restores the selected schema as the expected contract and marks other versions superseded. The rollback is recorded in the audit log.
        </p>
      </div>

      {err && <p className="text-sm text-bad mt-4" role="alert">{err}</p>}

      <div className="grid grid-cols-2 gap-3 mt-6">
        <button type="button" className="btn-secondary w-full" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary w-full disabled:opacity-50" onClick={confirm} disabled={busy}>
          {busy ? 'Rolling back…' : 'Confirm Rollback'}
        </button>
      </div>
    </Overlay>
  )
}

function SchemaHistory({ data, onRollback }) {
  const monitors = useMemo(() => {
    const map = new Map()
    for (const v of data.versions) if (!map.has(v.monitorId)) map.set(v.monitorId, v.monitorName)
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [data.versions])

  const [monitorId, setMonitorId] = useState(monitors[0]?.id || null)
  const versions = data.versions.filter((v) => v.monitorId === monitorId)
  const current = versions.find((v) => v.status === 'expected') || null
  const [selectedId, setSelectedId] = useState(null)
  const selected = versions.find((v) => v.id === selectedId) || versions.find((v) => v.status !== 'expected') || versions[0] || null

  if (!versions.length) {
    return (
      <section className="card">
        <h2 className="text-lg font-bold text-ink">Schema History &amp; Rollback Points</h2>
        <p className="text-sm text-muted mt-2">No schema snapshots recorded yet. Snapshots appear once an API monitor's contract is captured.</p>
      </section>
    )
  }

  const selFields = fieldsOf(selected)
  const curFields = fieldsOf(current)
  const added = selFields.filter((f) => !curFields.includes(f))
  const removed = curFields.filter((f) => !selFields.includes(f))
  const isCurrent = selected && current && selected.id === current.id

  return (
    <section className="space-y-6" aria-labelledby="schema-title">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Auditing Engine / Rollback Ledger</p>
          <h2 id="schema-title" className="text-2xl font-bold tracking-tight text-ink mt-1">Schema History &amp; Rollback Points</h2>
          <p className="text-sm text-muted mt-1">Track upstream schema evolutions, human approvals, and 1-click rollback snapshots.</p>
        </div>
        {monitors.length > 1 && (
          <select
            aria-label="Target monitor"
            value={monitorId}
            onChange={(e) => { setMonitorId(e.target.value); setSelectedId(null) }}
            className="bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            {monitors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {/* Contract Evolution Ribbon */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <h3 className="text-lg font-bold text-ink">Contract Evolution</h3>
          <Pill variant="ok">{versions.length} snapshot{versions.length === 1 ? '' : 's'} recorded</Pill>
          <span className="text-xs text-muted">{versions[0].monitorName}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {versions.map((v) => {
            const live = v.status === 'expected'
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                aria-pressed={selected?.id === v.id}
                className={`text-left rounded-xl p-4 bg-surface ${live ? 'border-2 border-ok' : 'border border-slate-200'} ${selected?.id === v.id ? 'ring-2 ring-brand/30' : ''}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xl font-bold text-ink">{v.version}</span>
                  <Pill variant={live ? 'ok' : 'warn'}>{live ? 'LIVE NOW' : 'Superseded'}</Pill>
                </div>
                <p className="text-xs text-muted">{fmtDate(v.createdAt)}</p>
                <div className="border-t border-slate-200 mt-4 pt-3 space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted">Fields</span><span className="font-semibold">{fieldsOf(v).length}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted">Drift events</span>
                    <span className={`font-semibold ${v.changeCount ? 'text-bad' : ''}`}>{v.changeCount}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Snapshot table */}
        <div className="card xl:col-span-2 !p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-200">
            <div>
              <h3 className="text-lg font-bold text-ink">Snapshot History</h3>
              <p className="text-xs text-muted mt-1">Schema versions captured for this monitor</p>
            </div>
            <Pill variant="ok">Audit Active</Pill>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base !border-0">
              <thead>
                <tr>
                  <th scope="col">TIMESTAMP</th>
                  <th scope="col">SNAPSHOT / VER</th>
                  <th scope="col">EVENT</th>
                  <th scope="col">DRIFT</th>
                  <th scope="col"><span className="sr-only">Inspect</span></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {[...versions].reverse().map((v) => (
                  <tr key={v.id} className={selected?.id === v.id ? 'bg-brand/5' : ''}>
                    <td className="whitespace-nowrap">{fmtDate(v.createdAt)}</td>
                    <td>
                      <p className="font-semibold text-ink font-mono text-xs">#{v.id.slice(-8)}</p>
                      <p className="text-xs text-muted">{v.version}{v.status === 'expected' ? ' (Active)' : ''}</p>
                    </td>
                    <td><Pill variant={EVENT[v.status]?.variant || 'neutral'}>{EVENT[v.status]?.label || v.status}</Pill></td>
                    <td>{v.changeCount ? <Pill variant="bad">Detected: {v.changeTypes.join(', ')}</Pill> : <span className="text-muted">—</span>}</td>
                    <td>
                      <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => setSelectedId(v.id)}>Inspect</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Snapshot inspector */}
        <aside className="card h-fit" aria-labelledby="inspector-title">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Snapshot Inspector</p>
              <h3 id="inspector-title" className="text-lg font-bold text-ink mt-1 font-mono">#{selected.id.slice(-8)}</h3>
            </div>
            <Pill variant={isCurrent ? 'ok' : 'warn'}>{selected.version}</Pill>
          </div>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-ink">Schema Delta</h4>
              <span className="text-xs text-muted uppercase">{selected.version} vs current {current?.version || '—'}</span>
            </div>
            {isCurrent ? (
              <p className="text-xs text-muted">This is the live contract.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 p-3 space-y-3 text-xs">
                <div>
                  <p className="font-bold uppercase text-muted mb-2">Restored by rollback</p>
                  {added.length ? added.map((f) => (
                    <p key={f} className="flex items-center gap-2"><span className="text-ok font-bold">+</span><code className="text-ok">{f}</code></p>
                  )) : <p className="text-muted">None</p>}
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <p className="font-bold uppercase text-muted mb-2">Dropped by rollback</p>
                  {removed.length ? removed.map((f) => (
                    <p key={f} className="flex items-center gap-2"><span className="text-bad font-bold">−</span><code className="text-bad">{f}</code></p>
                  )) : <p className="text-muted">None</p>}
                </div>
              </div>
            )}
          </div>
          <button type="button" className="btn-primary w-full disabled:opacity-50" disabled={isCurrent} onClick={() => onRollback(selected, current)}>
            {isCurrent ? 'Currently live' : `Prepare Rollback to ${selected.version}`}
          </button>
          <p className="text-xs text-muted text-center mt-3">Requires human confirmation</p>
        </aside>
      </div>
    </section>
  )
}

function AuditTrail({ audit }) {
  return (
    <section className="card !p-0 overflow-hidden" aria-labelledby="audit-title">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-200">
        <h2 id="audit-title" className="text-lg font-bold text-ink">Audit trail</h2>
        <Pill variant="neutral">Last {audit.length} entries</Pill>
      </div>
      {audit.length === 0 ? (
        <p className="text-sm text-muted p-6 text-center">No audit entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base !border-0">
            <thead>
              <tr><th scope="col">TIME</th><th scope="col">ACTION</th><th scope="col">ACTOR</th><th scope="col">ENTITY</th></tr>
            </thead>
            <tbody className="text-sm">
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{fmtDate(a.timestamp)}</td>
                  <td className="font-mono text-xs">{a.action}</td>
                  <td>{a.actorName || 'system'}</td>
                  <td className="text-xs text-muted">{a.entityType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ---------- Page ----------

export default function History() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [rollback, setRollback] = useState(null) // { target, current }

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await get('/api/history'))
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Quick Revert = most recent superseded version of the first monitor that has a live contract.
  const quickRevert = useMemo(() => {
    if (!data) return null
    const current = data.versions.find((v) => v.status === 'expected')
    if (!current) return null
    const prev = data.versions
      .filter((v) => v.monitorId === current.monitorId && v.status !== 'expected')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
    return prev ? { target: prev, current } : null
  }, [data])

  return (
    <AppLayout dataPage="history">
      <div className="space-y-10 pb-28">
        <ReportsPanel />

        {error ? (
          <div className="card"><ErrorState onRetry={load} /></div>
        ) : !data ? (
          <div className="space-y-4"><Skeleton lines={2} width="40%" /><Skeleton type="card" /></div>
        ) : (
          <>
            <SchemaHistory data={data} onRollback={(target, current) => setRollback({ target, current })} />
            <AuditTrail audit={data.audit} />
          </>
        )}
      </div>

      {/* Sticky bottom action bar */}
      {data && (
        <div className="fixed bottom-4 left-64 right-0 z-40 px-4">
          <div className="max-w-5xl mx-auto bg-surface border border-slate-200 rounded-xl shadow-lg px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-ok" aria-hidden="true" />
              <span className="text-sm font-semibold text-ink">Rollback snapshot engine ready</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary !py-2 !px-3 text-xs"
                onClick={() => downloadFile('setu-audit-bundle.json', JSON.stringify(data, null, 2), 'application/json')}
              >
                ↓ Download Audit Bundle
              </button>
              <button
                type="button"
                className="btn-primary !py-2 !px-3 text-xs disabled:opacity-50"
                disabled={!quickRevert}
                onClick={() => setRollback(quickRevert)}
              >
                ↶ Quick Revert{quickRevert ? ` (${quickRevert.target.version})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {rollback && <RollbackOverlay target={rollback.target} current={rollback.current} onClose={() => setRollback(null)} />}
    </AppLayout>
  )
}
