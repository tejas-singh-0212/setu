// Onboarding — context.md §5.2 (Add Monitor, no shell)

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Plug } from 'lucide-react'
import { post } from '../lib/api'

const INTERVALS = [
  { value: '30', label: '30 seconds' },
  { value: '60', label: '60 seconds' },
  { value: '300', label: '5 minutes' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', url: '', type: 'api', method: 'GET', interval: '60' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const submit = async () => {
    setError(null)
    if (!form.name.trim()) return setError('Give the monitor a name.')
    if (!form.url.trim()) return setError('Enter the URL to monitor.')
    try {
      new URL(form.url)
    } catch {
      return setError('URL must be complete (including https://).')
    }
    setSaving(true)
    try {
      await post('/monitors', {
        name: form.name.trim(),
        type: form.type,
        url: form.url.trim(),
        method: form.method,
        intervalSec: parseInt(form.interval, 10),
      })
      navigate('/dashboard')
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-cream" data-page="onboarding">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-brand text-white">
        <img src="/logo.svg" alt="Setu — self-healing API integration" className="w-28 h-28 rounded-2xl shadow-lg shadow-ink/20" />
        <div>
          <h2 className="text-3xl xl:text-4xl font-bold tracking-tight leading-tight max-w-sm">Watch it before your users do.</h2>
          <p className="mt-3 text-white/80 max-w-sm">
            One monitor starts continuous probes: uptime, latency, schema, DNS and certificates.
          </p>
        </div>
        <p className="text-xs text-white/60">You can add more monitors any time.</p>
      </div>

      {/* Right — form card */}
      <div className="flex items-center justify-center p-6">
        <div className="bg-surface rounded-2xl p-8 sm:p-10 w-full max-w-md shadow-pop border border-slate-200">
          <span className="pill-ai">STEP 1 OF 1</span>
          <h1 className="text-3xl font-bold tracking-tight text-ink mt-3 mb-6">Add your first monitor</h1>

          {/* Type chooser */}
          <div className="grid grid-cols-2 gap-3 mb-6" role="radiogroup" aria-label="Monitor type">
            <button
              type="button"
              role="radio"
              aria-checked={form.type === 'website'}
              onClick={() => set({ type: 'website' })}
              className={`text-left rounded-xl border p-4 transition-all ${
                form.type === 'website'
                  ? 'border-brand ring-2 ring-brand/20 bg-brand/5'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${form.type === 'website' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true"><Globe size={18} /></span>
              <p className="font-semibold text-ink text-sm mt-2">Website</p>
              <p className="text-xs text-slate-500 mt-1">Uptime, SSL, DNS, performance</p>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={form.type === 'api'}
              onClick={() => set({ type: 'api' })}
              className={`text-left rounded-xl border p-4 transition-all ${
                form.type === 'api'
                  ? 'border-brand ring-2 ring-brand/20 bg-brand/5'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${form.type === 'api' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true"><Plug size={18} /></span>
              <p className="font-semibold text-ink text-sm mt-2">REST API</p>
              <p className="text-xs text-slate-500 mt-1">Latency, schema, errors</p>
            </button>
          </div>

          {form.type === 'api' && (
            <div className="mb-4">
              <label htmlFor="ob-method" className="block text-sm font-medium text-slate-600 mb-1.5">Method</label>
              <select
                id="ob-method"
                className="input-base w-full  !py-2.5"
                value={form.method}
                onChange={(e) => set({ method: e.target.value })}
              >
                <option value="GET">GET (default)</option>
                <option value="POST">POST</option>
              </select>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="ob-name" className="block text-sm font-medium text-slate-600 mb-1.5">Name</label>
              <input
                id="ob-name"
                className="input-base w-full  !py-2.5"
                type="text"
                placeholder='e.g. REST Countries API'
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ob-url" className="block text-sm font-medium text-slate-600 mb-1.5">URL</label>
              <input
                id="ob-url"
                className="input-base w-full  !py-2.5 font-mono text-sm"
                type="url"
                placeholder="https://api.example.com/v1/health"
                value={form.url}
                onChange={(e) => set({ url: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ob-interval" className="block text-sm font-medium text-slate-600 mb-1.5">Probe Interval</label>
              <select
                id="ob-interval"
                className="input-base w-full  !py-2.5"
                value={form.interval}
                onChange={(e) => set({ interval: e.target.value })}
              >
                {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-bad" role="alert">{error}</p>
          )}

          <button
            className="btn-primary w-full mt-6 py-3 text-base disabled:opacity-60"
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Starting…' : 'Start Monitoring'}
          </button>

          <p className="mt-5 text-sm text-slate-500 text-center">
            You can add more monitors after setup.
          </p>
          <button className="mt-2 w-full text-sm text-slate-400 hover:text-slate-600" onClick={() => navigate('/dashboard')}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
