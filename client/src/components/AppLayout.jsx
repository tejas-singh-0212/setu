// AppLayout — renders Sidebar + Topbar + main content

import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { RequireAuth } from './RequireAuth'

export const AppLayout = ({ dataPage, children }) => {
  // If login or onboarding, render children full-bleed (no shell)
  if (dataPage === 'login' || dataPage === 'onboarding') {
    return <main className="min-h-screen p-6">{children}</main>
  }

  return (
    <div>
      <Sidebar dataPage={dataPage} />
      <Topbar />
      <main className="ml-64 pt-14 p-6">{children}</main>
    </div>
  )
}