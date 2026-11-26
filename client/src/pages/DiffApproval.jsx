// Diff & Approval — context.md §5.6 (drift incident detail, v1 diff layout +
// AI root cause + suggested recovery actions through the approval gate)

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout, Skeleton, ErrorState, Pill, Overlay } from '../components'
import { get, post } from '../lib/api'

// ---------- helpers ----------

function fieldsOf(schema) {
  if (!schema?.schema_json) return {}
  const f = schema.schema_json.fields
  if (Array.isArray(f)) {
    const out = {}
    f.forEach((n) => { out[n] = 'any' })
    return out
  }
  return f && typeof f === 'object' ? f : {}
}

// Row model for the side-by-side table.
// Pairs removed→added names (capital → capital_city) so each rename is one row.
function buildRows(expectedSchema, detectedSchema) {
  const exp = fieldsOf(expectedSchema)
  const det = fieldsOf(detectedSchema)
  const expNames = Object.keys(exp)
  const detNames = Object.keys(det)
  const removed = expNames.filter((n) => !(n in det))
  const added = detNames.filter((n) => !(n in exp))

  // Rename pairing: detected name extends/contains the removed name
  const renameOf = {} // detectedName → expectedName
  const used = new Set()
  for (const a of added) {
    const hit = removed.find((r) => !used.has(r) && (a.startsWith(r) || a.includes(r)))
    if (hit) {
      renameOf[a] = hit
      used.add(hit)
    }
  }

  const rows = []
  for (const n of expNames) {
    if (n in det) {
      const changed = exp[n] !== 'any' && det[n] !== 'any' && exp[n] !== det[n]
      rows.push({ name: n, expType: exp[n], detType: det[n], change: changed ? 'type_changed' : 'same' })
    } else if (used.has(n)) {
      const target = Object.keys(renameOf).find((k) => renameOf[k] === n)
      rows.push({ name: n, expType: exp[n], detType: det[target], change: 'renamed', paired: target })
    } else {
      rows.push({ name: n, expType: exp[n], detType: null, change: 'removed' })
    }
  }
  for (const n of detNames) {
    if (n in exp || n in renameOf) continue
    rows.push({ name: n, expType: null, detType: det[n], change: 'added' })
  }
  return rows
}

const CHANGE_PILL = {
  same: null,
  removed: { variant: 'bad', label: 'removed' },
  renamed: { variant: 'warn' },
  type_changed: { variant: 'warn', label: 'type changed' },
  added: { variant: 'ok', label: 'added' },
}

// ---------- suggested actions (spec §5.6) ----------

// RAG pipeline suggestion (server-provided via /incidents/:id → drift.suggestion).
// Returns [] whenever the pipeline is offline/abstained — the built-in
// suggestions below remain as the fallback, so the page always works.
function ragSuggestions(drift) {
  const s = drift?.suggestion
  if (!s || s.status !== 'suggested' || !Array.isArray(s.mappings) || !s.mappings.length) return []
  const detectedId = drift?.detected?.id
  const detail = s.mappings
    .map((m) => `${m.source_path} → ${m.target_path} (${m.operation})`)
    .join(' · ')
  return [
    {
      key: 'rag-transform',
      title: 'Apply RAG-suggested mapping',
      detail: `${s.summary} — ${detail}`,
      kind: 'transform',
      payload: detectedId ? { versionId: detectedId, mappings: s.mappings, evidenceIds: s.retrieved_fix_ids } : {},
      rag: true,
      evidenceCount: s.retrieved_fix_ids?.length || 0,
    },
  ]
}

function suggestionsFor(drift) {
  const detectedId = drift?.detected?.id
  const expectedId = drift?.expected?.id
  return [
    {
      key: 'transform',
      title: 'Apply transform',
      detail: 'Remap `capital` → `capital_city` + coerce `population` number→string',
      kind: 'transform',
      payload: detectedId ? { versionId: detectedId } : {},
    },
    {
      key: 'rollback',
      title: 'Rollback to schema v1.1',
      detail: 'Restore the last expected contract and supersede the detected one',
      kind: 'mapping_rollback',
      payload: expectedId ? { versionId: expectedId } : {},
    },
    {
      key: 'timeout',
      title: 'Set fallback timeout 5s',
      detail: 'Absorb slow upstream responses while the contract settles',
      kind: 'timeout',
      payload: { timeoutMs: 5000 },
    },
  ]
}

// ---------- page ----------

export default function DiffApproval() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [detail, setDetail] = useState(null)
  const [ragCount, setRagCount] = useState(null)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(null) // selected suggestion
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [phaseMsg, setPhaseMsg] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      let incidentId = id
      if (!incidentId) {
        const list = await get('/incidents?type=drift&status=open&range=all')
        if (!list.length) {
          const any = await get('/incidents?type=drift&range=all')
          incidentId = any[0]?.id
        } else {
          incidentId = list[0].id
        }
        if (!incidentId) {
          setError(new Error('No drift incident found — the contract is healthy.'))
          return
        }
      }
      const d = await get(`/incidents/${incidentId}`)
      if (d.incident.type !== 'drift') {
        setError(new Error('That incident is not a schema drift — open it from Incidents.'))
        return
      }
      setDetail(d)
      try {
        const llm = await get('/llm/status')
        setRagCount(llm.ragCount)
      } catch { /* badge stays hidden */ }
    } catch (e) {
      setError(e)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const execute = async () => {
    const s = confirming
    setPhase('running')
    setPhaseMsg(null)
    try {
      const action = await post('/recovery', {
        incidentId: detail.incident.id,
        kind: s.kind,
        payload: s.payload,
      })
      await post(`/recovery/${action.id}/approve`)
      const verified = await post(`/recovery/${action.id}/verify`)
      setPhase('done')
      setPhaseMsg(verified.postCheckOk
        ? 'Recovery applied and verified — post-check passed.'
        : 'Recovery executed but the post-check failed — see History & Reports.')
    } catch (e) {
      setPhase('idle')
      setPhaseMsg(e.message)
    }
  }

  const reject = async () => {
    try {
      const pending = (detail.actions || []).find((a) => a.status === 'pending')
      if (pending) await post(`/recovery/${pending.id}/reject`)
      navigate('/incidents')
    } catch (e) {
      setPhaseMsg(e.message)
    }
  }

  if (error) {
    return (
      <AppLayout dataPage="diff">
        <div className="card text-center">
          <ErrorState onRetry={load} />
          <button className="btn-secondary mt-2" onClick={() => navigate('/incidents')}>Back to Incidents</button>
        </div>
      </AppLayout>
    )
  }

  if (!detail) {
    return (
      <AppLayout dataPage="diff">
        <div className="space-y-4">
          <Skeleton lines={2} width="40%" />
          <Skeleton type="card" />
        </div>
      </AppLayout>
    )
  }

  const { incident, monitor, drift, actions } = detail
  const diagnosis = incident.diagnosis
  const rows = drift ? buildRows(drift.expected, drift.detected) : []
  const suggestions = [...ragSuggestions(drift), ...suggestionsFor(drift)]

  return (
    <AppLayout dataPage="diff">
      {/* Guardrail banner */}
      <div className="rounded-xl border border-brand/30 bg-brand/5 px-5 py-3.5 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-ink">
          <span className="text-brand font-bold" aria-hidden="true">🛡</span>
          <span>
            <strong>Guardrail:</strong> recovery is Setu-controlled <em>config only</em> — every action passes
            your approval gate, then a post-check probe verifies it.
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={() => navigate('/history')}>Rollback points →</button>
          <button className="btn-secondary text-xs" onClick={() => navigate('/incidents')}>← Incidents</button>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-ink">Diff &amp; Approval</h1>
            <Pill variant="bad">drift</Pill>
            <Pill variant={incident.severity === 'high' ? 'bad' : 'warn'}>{incident.severity}</Pill>
            <Pill variant={incident.status === 'open' ? 'bad' : 'warn'}>{incident.status}</Pill>
          </div>
          <p className="text-slate-500 text-sm mt-1.5">
            {monitor.name} · <span className="font-mono text-xs">{monitor.url}</span>
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>{new Date(incident.openedAt).toLocaleString()}</p>
          <p className="mt-1">{actions.length ? `${actions.length} recovery attempt(s)` : 'no recovery attempted yet'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left — AST-ish side-by-side diff (2 cols) */}
        <section className="xl:col-span-2 card !p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-ink">Contract diff</h2>
            <div className="flex gap-2 text-xs">
              <Pill variant="neutral">{drift?.expected?.version || 'expected'}</Pill>
              <span className="text-slate-400 self-center">→</span>
              <Pill variant="warn">{drift?.detected?.version || 'detected'}</Pill>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-1/3">EXPECTED · {drift?.expected?.version || '—'}</th>
                  <th className="w-1/3">DETECTED · {drift?.detected?.version || '—'}</th>
                  <th>CHANGE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const pill = CHANGE_PILL[r.change]
                  const expCell = (
                    <code className={`font-mono text-sm ${r.change === 'removed' ? 'text-bad line-through' : r.change === 'renamed' ? 'text-warn' : r.change === 'type_changed' ? 'text-warn' : 'text-ink'}`}>
                      {r.name}{r.expType && r.expType !== 'any' ? `: ${r.expType}` : ''}
                    </code>
                  )
                  const detName = r.change === 'renamed' ? r.paired : r.name
                  const detCell = r.change === 'removed' ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <code className={`font-mono text-sm ${r.change === 'added' ? 'text-ok' : r.change === 'renamed' ? 'text-warn' : r.change === 'type_changed' ? 'text-warn' : 'text-ink'}`}>
                      {detName}{r.detType && r.detType !== 'any' ? `: ${r.detType}` : ''}
                    </code>
                  )
                  return (
                    <tr key={`${r.name}-${i}`} className={r.change !== 'same' ? 'bg-amber-50/40' : ''}>
                      <td>{expCell}</td>
                      <td>{detCell}</td>
                      <td>
                        {pill
                          ? <Pill variant={pill.variant}>{r.change === 'renamed' ? `${r.name} → ${r.paired}` : pill.label}</Pill>
                          : <span className="text-xs text-slate-400">unchanged</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
            {drift?.change ? `Change detected ${new Date(drift.change.detectedAt).toLocaleString()} · ${drift.change.changeType}` : 'No recorded change event'}
            {drift?.mappingFixes?.length ? ` · mapping fix: ${drift.mappingFixes[0].fix_code}` : ''}
          </div>
        </section>

        {/* Right column */}
        <div className="space-y-6">
          {/* Probable root cause */}
          <section className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-ink">Probable Root Cause</h2>
              <Pill variant="ai">AI · LLM + RAG</Pill>
            </div>
            <p className="text-sm text-ink leading-relaxed">
              {diagnosis?.summary || incident.probableCause || 'Diagnosis running…'}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="pill-neutral">
                Confidence {diagnosis ? `${Math.round((diagnosis.confidence || 0) * 100)}%` : '—'}
              </span>
              {ragCount != null && (
                <span className="pill-ai">RAG: {diagnosis?.ragUsed ?? ragCount} similar incidents</span>
              )}
            </div>
          </section>

          {/* Suggested recovery actions */}
          <section className="card">
            <h2 className="font-bold text-ink mb-1">Suggested recovery actions</h2>
            <p className="text-xs text-slate-500 mb-4">Choose one — Setu proposes, you approve, post-check verifies.</p>
            <div className="space-y-3">
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  className="w-full text-left rounded-xl border border-slate-200 p-4 hover:border-brand hover:bg-brand/5 transition-colors"
                  onClick={() => { setConfirming(s); setPhase('idle'); setPhaseMsg(null) }}
                >
                  <span className="text-sm font-semibold text-ink">{s.title}</span>
                  <span className="block text-xs text-slate-500 mt-1 font-mono">{s.detail}</span>
                  {s.rag ? (
                    <span className="inline-block mt-2 pill-neutral">
                      RAG · {s.evidenceCount} retrieved fix{s.evidenceCount === 1 ? '' : 'es'} · requires approval
                    </span>
                  ) : (
                    <span className="inline-block mt-2 pill-neutral">Dry-run first · post-check enabled</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* History link */}
          <section className="card flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Rollback points</p>
              <p className="text-xs text-slate-500">Schema snapshots live in History &amp; Reports</p>
            </div>
            <button className="btn-secondary text-sm" onClick={() => navigate('/history')}>Open →</button>
          </section>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-4 left-64 right-0 z-40 px-4">
        <div className="max-w-5xl mx-auto bg-surface border border-slate-200 rounded-xl shadow-lg px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" aria-hidden="true" />
            {incident.title}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={reject}>Reject proposal</button>
            <button className="btn-primary text-sm" onClick={() => setConfirming(suggestions[0])}>
              Review &amp; approve…
            </button>
          </div>
        </div>
      </div>

      {/* Confirm overlay */}
      <Overlay isOpen={!!confirming} onClose={() => phase !== 'running' && setConfirming(null)}>
        {confirming && (
          <div className="pb-2">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <Pill variant="warn">Approval required</Pill>
                <h2 className="text-xl font-bold text-ink mt-3">{confirming.title}</h2>
                <p className="text-sm text-slate-500 mt-1 font-mono">{confirming.detail}</p>
              </div>
              <button className="btn-secondary !p-2" onClick={() => setConfirming(null)} aria-label="Close">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <Pill variant="neutral">Dry-run first</Pill>
              <Pill variant="neutral">Post-check enabled</Pill>
              <Pill variant="neutral">Config change only</Pill>
            </div>

            <p className="text-sm text-slate-600 mt-4">
              Setu executes this config action only after your approval, then runs a post-check probe to verify
              recovery. Every step is written to the audit trail.
            </p>

            {phaseMsg && (
              <p className={`text-sm mt-4 ${phase === 'done' ? 'text-ok' : 'text-bad'}`} role="alert">
                {phaseMsg}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                className="btn-secondary w-full"
                onClick={() => (phase === 'done' ? (setConfirming(null), navigate('/history')) : setConfirming(null))}
              >
                {phase === 'done' ? 'View History' : 'Cancel'}
              </button>
              {phase !== 'done' && (
                <button className="btn-primary w-full" onClick={execute} disabled={phase === 'running'}>
                  {phase === 'running' ? 'Approving…' : 'Approve & Apply'}
                </button>
              )}
            </div>
          </div>
        )}
      </Overlay>
    </AppLayout>
  )
}
