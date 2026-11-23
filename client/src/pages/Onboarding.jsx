// Onboarding — context.md §5.2

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { Pill, StatCard, EmptyState, Skeleton } from '../components'

export default function Onboarding() {
  const navigate = useNavigate()
  const [step] = useState(1)
  const [form] = useState({
    name: '',
    url: '',
    type: 'api',
    method: 'GET',
    interval: '60',
  })

  // Mock monitors data - in real app, this would come from API
  const mockMonitors = [
    { id: 1, name: 'REST Countries API', type: 'api', url: 'https://restcountries.com/v3.1/all?fields=name,capital,currencies,region,population,area,flag' },
    { id: 2, name: 'JSONPlaceholder', type: 'api', url: 'https://jsonplaceholder.typicode.com' },
    { id: 3, name: 'Open-Meteo Site', type: 'website', url: 'https://open-meteo.com' },
    { id: 4, name: 'Wikipedia', type: 'website', url: 'https://www.wikipedia.org' },
  ]

  return (
    <AppLayout dataPage="onboarding">
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-md text-center">
          <div className="mb-6">
            <span className="text-xl pill-ai font-medium">STEP 1 OF 1</span>
            <h1 className="text-3xl font-bold text-ink mb-4">Add your first monitor</h1>
          </div>

          {/* Type Chooser */}
          <div className="mb-8">
            <div className="flex gap-3 mb-4">
              <div
                className="pill-ok bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm font-medium text-green-800 cursor-default"
                role="button"
                tabIndex={0}
                onClick={() => setForm(prev => ({ ...prev, type: 'website' }))}
                aria-selected={form.type === 'website'}
              >
                🌐 Website
              </div>
              <div
                className="pill-warn bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm font-medium text-amber-800 cursor-default"
                role="button"
                tabIndex={0}
                onClick={() => setForm(prev => ({ ...prev, type: 'api' }))}
                aria-selected={form.type === 'api'}
              >
                🔌 REST API
              </div>
            </div>

            {form.type === 'api' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-600 mb-2">Method</label>
                <select
                  className="input-base w-full rounded-lg border border-slate-300 focus:border-brand focus:ring-brand focus:ring-offset-2 py-2 px-3"
                  value={form.method}
                  onChange={(e) => setForm(prev => ({ ...prev, method: e.target.value }))}
                >
                  <option value="GET">GET (default)</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
            )}

            {form.type === 'website' && (
              <p className="text-slate-500 text-sm mb-4">
                Websites monitor uptime, SSL certificate, DNS resolution and performance
              </p>
            )}

            {form.type === 'api' && (
              <p className="text-slate-500 text-sm mb-4">
                APIs monitor status, latency, schema drift and error rates
              </p>
            )}
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Name</label>
              <input
                className="input-base w-full rounded-lg border border-slate-300 focus:border-brand focus:ring-brand focus:ring-offset-2 py-3 px-4"
                type="text"
                placeholder="e.g. REST Countries API"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">URL</label>
              <input
                className="input-base w-full rounded-lg border border-slate-300 focus:border-brand focus:ring-brand focus:ring-offset-2 py-3 px-4"
                type="url"
                placeholder="e.g. https://restcountries.com/v3.1/all?fields=name,capital,currencies,region,population,area,flag"
                value={form.url}
                onChange={(e) => setForm(prev => ({ ...prev, url: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Probe Interval</label>
              <select
                className="input-base w-full rounded-lg border border-slate-300 focus:border-brand focus:ring-brand focus:ring-offset-2 py-3 px-3"
                value={form.interval}
                onChange={(e) => setForm(prev => ({ ...prev, interval: e.target.value }))}
              >
                <option value="30">30 seconds</option>
                <option value="60" selected>60 seconds</option>
                <option value="300">5 minutes</option>
              </select>
            </div>
          </div>

          {/* Primary Action */}
          <div className="mt-8">
            <button
              className="btn-primary w-full px-8 py-3 rounded-lg text-lg font-medium transition-colors"
              onClick={() => {
                // Create monitor via API
                fetch('/api/monitors', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: form.name,
                    type: form.type,
                    url: form.url,
                    method: form.method,
                    intervalSec: parseInt(form.interval),
                  }),
                  credentials: 'include',
                })
                  .then((r) => {
                    if (r.ok) navigate('/dashboard')
                    else r.json().then((e) => alert(e.error || 'Failed to create monitor'))
                  })
                  .catch(() => alert('Network error'))
              }}
            >
              Start Monitoring
            </button>
          </div>

          {/* Footer */}
          <p className="mt-6 text-sm text-slate-500">
            You can add more monitors after setup.
          </p>
        </div>
      </div>
    </AppLayout>
  )
}