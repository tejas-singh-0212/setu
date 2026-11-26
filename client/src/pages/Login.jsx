// Login — context.md §5.1 (split layout, no shell)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.12 3.04.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (res.ok) navigate('/dashboard', { replace: true })
        else setChecking(false)
      } catch {
        setChecking(false)
      }
    })()
  }, [navigate])

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-cream" data-page="login">
      {/* Left — brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-brand text-white">
        <img src="/logo.svg" alt="Setu — self-healing API integration" className="w-36 h-36 rounded-2xl shadow-lg shadow-ink/20" />
        <div>
          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight max-w-md">
            Reliable systems.<br />Automated maintenance.
          </h2>
          <p className="mt-4 text-white/80 max-w-md">
            Monitor websites &amp; REST APIs, catch failures early, recover safely — with a complete incident history.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/90">
            {[
              'Live probes, anomaly detection & dependency health',
              'LLM diagnosis with RAG over past incidents',
              'Approval-gated recovery with post-checks',
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Demo target · REST Countries API</p>
      </div>

      {/* Right — sign-in card */}
      <div className="flex items-center justify-center p-6">
        <div className="bg-surface rounded-2xl p-8 sm:p-10 w-full max-w-md shadow-pop border border-slate-200">
          <img src="/logo-mark.svg" alt="Setu" className="w-12 h-12 rounded-xl mb-6" />

          <h1 className="text-3xl font-bold tracking-tight text-ink mb-1">Welcome to Setu</h1>
          <p className="text-slate-500 mb-8">Sign in to your maintenance workspace</p>

          {checking ? (
            <div className="flex items-center justify-center gap-2 py-6">
              <span className="h-5 w-5 border-2 border-brand rounded-full border-t-transparent animate-spin" aria-hidden="true" />
              <span className="text-slate-500 text-sm">Checking session…</span>
            </div>
          ) : (
            <>
              <button
                className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-medium bg-white border border-slate-300 text-ink hover:bg-slate-50 active:bg-slate-100 transition-colors"
                onClick={() => { window.location.href = '/api/auth/google' }}
              >
                <GoogleIcon /> Continue with Google
              </button>
              <button
                className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-700 transition-colors mt-3"
                onClick={() => { window.location.href = '/api/auth/github' }}
              >
                <GitHubIcon /> Continue with GitHub
              </button>
            </>
          )}

          <footer className="mt-8 text-center">
            <p className="text-sm text-slate-500">Free during the demo period — no credit card required.</p>
            <p className="mt-1 text-xs text-slate-400">By signing in you agree to the terms.</p>
          </footer>
        </div>
      </div>
    </div>
  )
}
