// AppLayout — renders Sidebar + Topbar + main content

import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export const AppLayout = ({ dataPage, children }) => {
  // Login / onboarding render full-bleed (no shell)
  if (dataPage === 'login' || dataPage === 'onboarding') {
    return <main className="min-h-screen p-6">{children}</main>
  }

  return (
    <div className="min-h-screen bg-cream">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 btn-primary">
        Skip to content
      </a>
      <Sidebar dataPage={dataPage} />
      <Topbar dataPage={dataPage} />
      <main id="main" className="ml-64 pt-14" data-page={dataPage}>
        <div className="px-8 py-7 max-w-[1400px]">{children}</div>
      </main>
    </div>
  )
}
