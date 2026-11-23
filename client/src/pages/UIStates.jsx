// UI States — context.md §5.12

import { useEffect, useState } from 'react'
import { DataTable, Skeleton, EmptyState, ErrorState } from '../components'
import { AppLayout } from '../components/AppLayout'
import { useNavigate } from 'react-router-dom'
import { get } from '../lib/api'

export default function UIStates() {
  const [state, setState] = useState<'empty' | 'loading' | 'error'>('loading')
  const [monitors, setMonitors] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function check() {
      try {
        const data = await get('/monitors')
        if (!data || data.length === 0) {
          setState('empty')
        } else {
          setMonitors(data)
          setState('loading')
        }
      } catch (e) {
        setState('error')
      }
    }
    check()
  }, [])

  if (state === 'empty') {
    return (
      <AppLayout dataPage="states">
        <div className="min-h-screen bg-cream p-8">
          <EmptyState
            title="No monitors yet"
            description="Add your first monitor to start monitoring"
            actionLabel="Add Monitor"
            onAction={() => navigate('/onboarding')}
          />
        </div>
      </AppLayout>
    )
  }

  if (state === 'loading') {
    return (
      <AppLayout dataPage="states">
        <div className="min-h-screen bg-cream p-8">
          <div className="max-w-2xl mx-auto">
            <Skeleton lines={4} />
            <div className="mt-6 text-center">
              <p className="text-slate-500 text-sm">Running probes…</p>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout dataPage="states">
      <div className="min-h-screen bg-cream p-8">
        <ErrorState onRetry={() => setState('loading')} />
      </div>
    </AppLayout>
  )
}
