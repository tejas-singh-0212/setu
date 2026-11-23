// Login — context.md §5.1

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { Pill } from '../components/Pill'

export default function Login() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (res.ok) {
          navigate('/dashboard', { replace: true })
        } else {
          setChecking(false)
        }
      } catch (e) {
        setChecking(false)
      }
    })()
  }, [navigate])

  if (checking) {
    return (
      <AppLayout dataPage="login">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-md text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="h-5 w-5 border-2 border-brand rounded-full border-t-transparent rounded-r-full animate-spin"></span>
              <span className="text-slate-500 text-sm">Signing you in…</span>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout dataPage="login">
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-md text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-3xl font-bold text-brand">Setu</span>
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">Welcome to Setu</h1>
          <p className="text-slate-500 mb-8">Reliable systems. Automated maintenance.</p>
          <button
            className="btn-primary w-full px-8 py-3 rounded-lg text-lg font-medium transition-colors flex items-center justify-center gap-2 mx-auto"
            onClick={() => {
              window.location.href = '/api/auth/google'
            }}
          >
            Continue with Google
          </button>
          <button
            className="btn-secondary w-full px-8 py-3 rounded-lg text-lg font-medium transition-colors flex items-center justify-center gap-2 mx-auto mt-4"
            onClick={() => {
              window.location.href = '/api/auth/github'
            }}
          >
            Continue with GitHub
          </button>
          <footer className="mt-8 text-sm text-slate-500">
            <p>Free during the demo period — no credit card required.</p>
            <p className="mt-1 text-xs">By signing in you agree to the terms.</p>
          </footer>
        </div>
      </div>
    </AppLayout>
  )
}
