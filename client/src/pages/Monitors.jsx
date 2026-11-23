// Monitors — context.md §5.4

import { useEffect, useState } from 'react'
import { DataTable, StatCard, Pill } from '../components'
import { AppLayout } from '../components/AppLayout'
import { useNavigate } from 'react-router-dom'

export default function Monitors() {
  const navigate = useNavigate()
  const [monitors, setMonitors] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const m = await fetch('/api/monitors', { credentials: 'include' }).then(r => r.json())
        setMonitors(m)
      } catch (e) {
        console.error('Monitors load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <AppLayout dataPage="monitors">
        <div className="min-h-screen bg-cream p-8">
          <Skeleton rows={4} />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout dataPage="monitors">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 items-center justify-between flex">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">Monitors</h1>
          </div>

          <div>
            <button
              className="btn-secondary text-sm px-4 py-2 rounded-lg"
              onClick={() => navigate('/onboarding')}
            >
              + Add Monitor
            </button>
          </div>
        </div>
      </header>

      <main className="ml-64 pt-6 p-6">
        <DataTable
          columns={[
            { key: 'name', label: 'Monitor' },
            { key: 'type', label: 'Type' },
            { key: 'url', label: 'URL' },
            { key: 'interval', label: 'Interval' },
            { key: 'status', label: 'Status' },
            { key: 'health', label: 'Health' },
            { key: 'actions', label: 'Actions' },
          ]}
          data={monitors}
        />

        <footer className="mt-6 text-right">
          <p className="text-slate-500">
            4 of 4 monitors · all probing active
          </p>
        </footer>
      </main>
    </AppLayout>
  )
}