// Settings — context.md §5.11 (Part 3). Ported from v1 settings.html; BYOK API-key field removed.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout, Pill, Skeleton, ErrorState } from '../components'
import { get } from '../lib/api'

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'llm', label: 'LLM & RAG' },
  { key: 'telemetry', label: 'Telemetry Rules' },
  { key: 'safety', label: 'Safety' },
  { key: 'danger', label: 'Danger Zone' },
]

const WRITABLE = ['latencyThresholdMs', 'consecutiveSlow', 'maxRecoveryPerHour', 'probeIntervalDefault', 'ragEnabled']
const INTERVALS = [
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
]

// MOCK — shown only until Part 2's GET /api/llm/status exists. Remove at API parity.
const LLM_FALLBACK = {
  model: 'Llama 3.3 70B (Groq free tier)',
  provider: 'Llama via free inference API',
  endpoint: 'Set by server environment',
  healthy: null,
  embeddings: null,
}

// lib/api.js has no PUT helper (owned by Part 1), so Settings sends its own.
async function put(path, body) {
  const res = await fetch(path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(json.error || `Request failed (${res.status})`)
    e.status = res.status
    throw e
  }
  return json
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
      className={`relative inline-flex w-10 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-slate-300'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function Stepper({ value, onChange, min, max, label, unit }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className="w-9 h-9 rounded-lg border border-slate-200 bg-surface text-lg text-ink disabled:opacity-40" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <div className="flex-1 text-center">
        <span className="text-2xl font-bold text-ink" aria-live="polite">{value}</span>
        <p className="text-xs text-muted mt-1">{unit}</p>
      </div>
      <button type="button" className="w-9 h-9 rounded-lg border border-slate-200 bg-surface text-lg text-ink disabled:opacity-40" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}

function Card({ title, subtitle, badge, children, danger }) {
  return (
    <section className={`card ${danger ? '!border-bad/40' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className={`text-lg font-bold ${danger ? 'text-bad' : 'text-ink'}`}>{title}</h2>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  )
}

function LockedRow({ title, description }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted mt-1">{description}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Pill variant="neutral">Locked for demo</Pill>
        <Toggle checked disabled label={title} />
      </div>
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('general')
  const [saved, setSaved] = useState(null) // settings as stored on the server
  const [draft, setDraft] = useState(null)
  const [user, setUser] = useState(null)
  const [llm, setLlm] = useState(null)
  const [llmLive, setLlmLive] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [ragSaving, setRagSaving] = useState(false)
  const [dangerNote, setDangerNote] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, me] = await Promise.all([get('/api/settings'), get('/api/auth/me').catch(() => null)])
      setSaved(s.settings)
      setDraft(s.settings)
      setUser(me)
    } catch (e) {
      setError(e)
    }
    try {
      setLlm(await get('/api/llm/status'))
      setLlmLive(true)
    } catch {
      setLlm(LLM_FALLBACK)
      setLlmLive(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (error) return <AppLayout dataPage="settings"><ErrorState onRetry={load} /></AppLayout>
  if (!draft) {
    return (
      <AppLayout dataPage="settings">
        <div className="space-y-6"><Skeleton type="card" /><Skeleton type="card" /></div>
      </AppLayout>
    )
  }

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }))
  const dirtyKeys = WRITABLE.filter((k) => draft[k] !== saved[k] && k !== 'ragEnabled')

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      if (dirtyKeys.length) {
        await put('/api/settings', Object.fromEntries(dirtyKeys.map((k) => [k, draft[k]])))
      }
      navigate('/dashboard')
    } catch (e) {
      setSaveError(e.message)
      setSaving(false)
    }
  }

  // The RAG toggle saves immediately (context.md §5.11 → PUT /api/settings { ragEnabled }).
  const toggleRag = async (value) => {
    setRagSaving(true)
    setSaveError(null)
    set('ragEnabled', value)
    try {
      const res = await put('/api/settings', { ragEnabled: value })
      setSaved((s) => ({ ...s, ragEnabled: res.settings.ragEnabled }))
    } catch (e) {
      set('ragEnabled', saved.ragEnabled)
      setSaveError(e.message)
    } finally {
      setRagSaving(false)
    }
  }

  const provider = user?.provider === 'github' ? 'GitHub' : 'Google'
  const initials = (user?.name || user?.email || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  const embeddings = llm?.embeddings ?? llm?.ragIndexCount ?? llm?.embeddingCount ?? null

  return (
    <AppLayout dataPage="settings">
      <div className="space-y-6 pb-12">
        {/* Header */}
        <section className="card">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Workspace preferences</p>
              <h1 className="text-2xl font-bold tracking-tight text-ink mt-1">Platform &amp; Monitoring Settings</h1>
              <p className="text-sm text-muted mt-1">Configure telemetry threshold rules, recovery safety controls, and view the LLM &amp; RAG engine.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard')}>Discard</button>
              <button type="button" className="btn-primary disabled:opacity-50" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
          {saveError && <p className="text-sm text-bad mt-4" role="alert">{saveError}</p>}
          {dirtyKeys.length > 0 && !saveError && <p className="text-xs text-muted mt-4">{dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}</p>}

          <div className="flex flex-wrap items-center gap-2 mt-6" role="tablist" aria-label="Settings sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                  tab === t.key ? 'bg-brand text-white' : t.key === 'danger' ? 'text-bad hover:bg-bad/5' : 'text-muted hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {tab === 'general' && (
          <Card title="Profile" subtitle="From your sign-in provider">
            {user ? (
              <div className="flex items-center gap-4">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-14 h-14 rounded-full border border-slate-200" />
                ) : (
                  <span className="w-14 h-14 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center" aria-hidden="true">{initials}</span>
                )}
                <div>
                  <p className="text-base font-semibold text-ink">{user.name || '—'}</p>
                  <p className="text-sm text-muted">{user.email}</p>
                  <p className="mt-2"><Pill variant="ok">Signed in with {provider}</Pill></p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Profile unavailable.</p>
            )}
          </Card>
        )}

        {tab === 'llm' && (
          <Card
            title="Inference Engine & RAG Context"
            subtitle="Central OSS model used for diagnosis narratives and maintenance recommendations."
            badge={<Pill variant="ai">LLM + RAG</Pill>}
          >
            {/* Model & endpoint intentionally hidden from end users */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
              <div>
                <p className="text-sm font-semibold text-ink">Use past incidents &amp; fixes as RAG context</p>
                <p className="text-xs text-muted mt-1">
                  RAG index: {embeddings === null ? 'count unavailable' : `${Number(embeddings).toLocaleString()} embeddings`} (pgvector)
                </p>
              </div>
              <Toggle checked={!!draft.ragEnabled} onChange={toggleRag} disabled={ragSaving} label="Use RAG context" />
            </div>
            {!llmLive && <p className="text-xs text-muted mt-3">Live model status will appear once the LLM status service is online.</p>}
          </Card>
        )}

        {tab === 'telemetry' && (
          <Card title="Telemetry Rules" subtitle="Detection thresholds and polling defaults">
            <div className="mb-7">
              <div className="flex items-center justify-between gap-3 mb-2">
                <label htmlFor="latency-threshold" className="text-sm font-semibold text-ink">Latency Degradation Threshold</label>
                <span className="text-sm font-bold text-brand">{draft.latencyThresholdMs.toLocaleString()} ms</span>
              </div>
              <p className="text-xs text-muted mb-4">A probe slower than this counts as slow and as an SLA breach.</p>
              <input
                id="latency-threshold"
                type="range"
                min="250"
                max="2000"
                step="250"
                value={draft.latencyThresholdMs}
                onChange={(e) => set('latencyThresholdMs', Number(e.target.value))}
                className="w-full accent-brand cursor-pointer"
              />
              <div className="flex justify-between mt-2 text-xs text-muted"><span>250ms</span><span>1,000ms</span><span>2,000ms</span></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-bold text-ink">Consecutive Slow Calls</h3>
                <p className="text-xs text-muted mt-1 mb-4">Raises a latency alert.</p>
                <Stepper value={draft.consecutiveSlow} onChange={(v) => set('consecutiveSlow', v)} min={1} max={20} label="consecutive slow calls" unit="consecutive calls" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <label htmlFor="probe-interval" className="text-sm font-bold text-ink">Default Probe Interval</label>
                <p className="text-xs text-muted mt-1 mb-4">Used for new monitors.</p>
                <select
                  id="probe-interval"
                  value={draft.probeIntervalDefault}
                  onChange={(e) => set('probeIntervalDefault', Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm"
                >
                  {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-bold text-ink">Schema Inspection</h3>
                <p className="text-xs text-muted mt-1 mb-4">How API payloads are checked for drift.</p>
                <p className="text-sm font-medium text-ink">Inline on every API probe</p>
              </div>
            </div>
          </Card>
        )}

        {tab === 'safety' && (
          <Card title="Recovery Safety" subtitle="Constraints enforced before any recovery action runs">
            <div className="space-y-3">
              <LockedRow title="Require human approval" description="Every recovery action waits for an approval. Never bypassed." />
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Max recovery actions per hour</p>
                  <p className="text-xs text-muted mt-1">Further actions are blocked until the window resets.</p>
                </div>
                <div className="w-48"><Stepper value={draft.maxRecoveryPerHour} onChange={(v) => set('maxRecoveryPerHour', v)} min={1} max={20} label="max recovery actions per hour" unit="per hour" /></div>
              </div>
              <LockedRow title="Dry-run by default" description="Actions are simulated before they are applied." />
              <LockedRow title="Mandatory post-check" description="A probe verifies every executed action." />
            </div>
          </Card>
        )}

        {tab === 'danger' && (
          <Card title="Danger Zone" subtitle="Irreversible actions for your incident history and RAG index." danger badge={<Pill variant="bad">CAUTION</Pill>}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 border border-bad/20 rounded-xl p-5 bg-bad/5">
              <div>
                <h3 className="text-sm font-bold text-ink mb-1">Clear incident history &amp; RAG index</h3>
                <p className="text-sm text-muted">Deletes all incidents, recovery records and stored embeddings.</p>
                {dangerNote && <p className="text-sm text-bad mt-2" role="status">Disabled during the demo period.</p>}
              </div>
              <button type="button" className="bg-surface text-bad border border-bad rounded-lg px-4 py-2 font-medium hover:bg-bad/5 whitespace-nowrap" onClick={() => setDangerNote(true)}>
                Clear history &amp; RAG index
              </button>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
