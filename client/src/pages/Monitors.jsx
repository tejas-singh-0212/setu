// Monitors — context.md §5.4

import { useEffect, useState } from 'react'
import { DataTable, Skeleton } from '../components'
import { AppLayout } from '../components/AppLayout'
import { useNavigate } from 'react-router-dom'
import { get } from '../lib/api'

export default function Monitors() {
  const navigate = useNavigate()
  const [monitors, setMonitors] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const m = await get('/monitors')
        setMonitors(m)
      } catch (e) {
        console.error('Monitors load error:', e)
        setMonitors([])
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
          <Skeleton lines={4} />
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
            <p className="text-slate-500 text-sm">Registered websites & REST APIs</p>
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

      <main className="ml-64 pt-14 p-6">
        <DataTable
          columns={[
            { key: 'name', label: 'NAME' },
            { key: 'type', label: 'TYPE' },
            { key: 'url', label: 'URL' },
            { key: 'intervalSec', label: 'INTERVAL' },
            { key: 'status', label: 'STATUS' },
            { key: 'healthScore', label: 'HEALTH' },
            {
              key: 'actions',
              label: 'ACTIONS',
              render: (row) => (
                <button className="btn-secondary text-xs px-3 py-1" onClick={() => navigate(`/monitors/${row.id}`)}>
                  Edit
                </button>
              ),
            },
          ]}
          data={monitors}
        />

        <footer className="mt-6 text-right">
          <p className="text-slate-500">
            {monitors.length} of {monitors.length} monitors · all probing active
          </p>
        </footer>
      </main>
    </AppLayout>
  )
}
