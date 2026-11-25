// Maintenance Recommendations — context.md §5.9 (LLM + RAG cards,
// Apply → approval gate, Dismiss)

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, Skeleton, EmptyState, ErrorState, Pill, Overlay } from '../components'
import { get, post } from '../lib/api'

const SOURCE_LABEL = { telemetry: 'Telemetry', rag: 'RAG knowledge', dependency: 'Dependencies', llm: 'LLM review' }

function actionLabel(action) {
  switch (action?.kind) {
    case 'retry': return `Set retries → ${action.retries ?? 2} (exponential backoff)`
    case 'timeout': return `Set timeout → ${action.timeoutMs ?? 10000}ms`
    case 'cache': return 'Enable response cache'
    case 'transform': return `Apply transform · ${action.fix || 'schema remap'}`
    case 'mapping_rollback': return 'Roll back schema mapping'
    case 'interval': return `Set probe interval → ${action.minutes ?? 2} min`
    case 'ssl_renew': return 'Create certificate renewal reminder'
    default: return 'Review and apply'
  }
}

export default function Recommendations() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [phaseMsg, setPhaseMsg] = useState(null)
  const [llm, setLlm] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [recs, status] = await Promise.all([
        get('/recommendations'),
        get('/llm/status').catch(() => null),
      ])
      setRows(recs)
      setLlm(status)
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openApply = (rec) => {
    setConfirming(rec)
    setPhase('idle')
    setPhaseMsg(null)
  }

  const apply = async () => {
    const rec = confirming
    setPhase('running')
    try {
      const result = await post(`/recommendations/${rec.id}/apply`)
      if (result.action) {
        await post(`/recovery/${result.action.id}/approve`)
        const verified = await post(`/recovery/${result.action.id}/verify`)
        setPhase('done')
        setPhaseMsg(verified.postCheckOk
          ? 'Applied through the approval gate — post-check passed.'
          : 'Executed, but the post-check failed — see History & Reports.')
      } else {
        setPhase('done')
        setPhaseMsg('Recommendation applied. It has been recorded in the audit trail.')
      }
      load()
    } catch (e) {
      setPhase('idle')
      setPhaseMsg(e.message)
    }
  }

  const dismiss = async (rec) => {
    try {
      await post(`/recommendations/${rec.id}/dismiss`)
      setRows((rs) => rs.map((r) => (r.id === rec.id ? { ...r, status: 'dismissed' } : r)))
    } catch (e) {
      alert(e.message)
    }
  }

  if (error) return <AppLayout dataPage="recommendations"><div className="card"><ErrorState onRetry={load} /></div></AppLayout>
  if (!rows) {
    return (
      <AppLayout dataPage="recommendations">
        <div className="space-y-4">
          <Skeleton lines={2} width="45%" />
          {[0, 1, 2].map((i) => <Skeleton key={i} type="card" />)}
        </div>
      </AppLayout>
    )
  }

  const open = rows.filter((r) => r.status === 'open')
  const closed = rows.filter((r) => r.status !== 'open')

  return (
    <AppLayout dataPage="recommendations">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">Maintenance Recommendations</h1>
            {llm?.configured && <Pill variant="ai">LLM + RAG</Pill>}
          </div>
          <p className="text-slate-500 text-sm mt-1">Generated from telemetry, incidents and RAG knowledge base</p>
        </div>
        {llm && (
          <div className="text-right text-xs text-slate-400">
            <p>{llm.model || 'Rules-only mode (no LLM key)'}</p>
            <p className="mt-0.5">{llm.ragCount ?? 0} embeddings indexed</p>
          </div>
        )}
      </div>

      {!open.length ? (
        <div className="card">
          <EmptyState
            title="No open recommendations"
            description="Setu reviews telemetry and incidents continuously — check back after the next run."
            actionLabel="View incidents"
            onAction={() => navigate('/incidents')}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {open.map((rec) => (
            <article key={rec.id} className="card flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex gap-2 flex-wrap">
                  <Pill variant="ai">LLM + RAG</Pill>
                  <Pill variant="neutral">{SOURCE_LABEL[rec.source] || rec.source}</Pill>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(rec.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>

              <h2 className="font-bold text-ink leading-snug">{rec.title}</h2>

              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Why</p>
                <p className="text-sm text-slate-600">{rec.why}</p>
              </div>

              <p className="text-sm text-ink mt-3">
                <span className="text-slate-500">Suggested action: </span>
                <span className="font-mono text-xs">{actionLabel(rec.action)}</span>
              </p>

              <div className="flex gap-2 mt-auto pt-4">
                <button className="btn-primary text-sm" onClick={() => openApply(rec)}>Apply</button>
                <button className="btn-secondary text-sm" onClick={() => dismiss(rec)}>Dismiss</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Recently handled</h2>
          <div className="card !py-4">
            <ul className="divide-y divide-slate-100">
              {closed.map((rec) => (
                <li key={rec.id} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600 truncate">{rec.title}</span>
                  <Pill variant={rec.status === 'applied' ? 'ok' : 'neutral'}>{rec.status}</Pill>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <footer className="mt-8 text-sm text-slate-500">
        Next recommendation run in 6h · last run produced {rows.length} item{rows.length === 1 ? '' : 's'}
      </footer>

      {/* Apply confirmation overlay */}
      <Overlay isOpen={!!confirming} onClose={() => phase !== 'running' && setConfirming(null)}>
        {confirming && (
          <div>
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <Pill variant="warn">Approval required</Pill>
                <h2 className="text-xl font-bold text-ink mt-3">Apply recommendation</h2>
                <p className="text-sm text-slate-600 mt-1">{confirming.title}</p>
              </div>
              <button className="btn-secondary !p-2" onClick={() => setConfirming(null)} aria-label="Close">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <Pill variant="neutral">Dry-run first</Pill>
              <Pill variant="neutral">Post-check enabled</Pill>
              <Pill variant="neutral">Config change only</Pill>
            </div>

            <p className="text-sm text-slate-600 mt-4 font-mono text-xs">{actionLabel(confirming.action)}</p>

            {phaseMsg && (
              <p className={`text-sm mt-4 ${phase === 'done' ? 'text-ok' : 'text-bad'}`} role="alert">{phaseMsg}</p>
            )}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                className="btn-secondary w-full"
                onClick={() => (phase === 'done' ? (setConfirming(null), navigate('/history')) : setConfirming(null))}
              >
                {phase === 'done' ? 'View History' : 'Cancel'}
              </button>
              {phase !== 'done' && (
                <button className="btn-primary w-full" onClick={apply} disabled={phase === 'running'}>
                  {phase === 'running' ? 'Applying…' : 'Approve & Apply'}
                </button>
              )}
            </div>
          </div>
        )}
      </Overlay>
    </AppLayout>
  )
}
