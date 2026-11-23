// UI States — context.md §5.12

import { useEffect, useState } from 'react'
import { DataTable, Skeleton, EmptyState, ErrorState } from '../components'
import { AppLayout, RequireAuth } from '../components'
import { useNavigate, useLocation } from 'react-router-dom'

export default function UIStates() {
  const [state, setState] = useState<'empty' | 'loading' | 'error'>('empty')
  const [monitors, setMonitors] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Check monitors API to determine state
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/monitors', { credentials: 'include' })
        const data = await res.json()
        if (!data || data.length === 0) {
          setState('empty')
        } else {
          setState('loading') // will transition after first probe
        }
      } catch (e) {
        setState('error')
      }
    }
    check()
  }, [])

  // Transition from loading to error if no probes after a bit
  useEffect(() => {
    if (state === 'loading') {
      const timer = setTimeout(() => {
        // If still no real probe data, show error
        setState('error')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [state])

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
            <Skeleton rows={4} />
            <div className="mt-6 text-center">
              <p className="text-slate-500 text-sm">Running probes…</p>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  // error state
  return (
    <AppLayout dataPage="states">
      <div className="min-h-screen bg-cream p-8">
        <ErrorState
          onRetry={() => {
            // Reload monitors state
            setState('loading')
          }}
        />
      </div>
    </AppLayout>
  )
}