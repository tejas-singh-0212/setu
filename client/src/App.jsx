// App.jsx — React Router with available lazy routes

import React from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'

const LazyLogin = React.lazy(() => import('./pages/Login'))
const LazyOnboarding = React.lazy(() => import('./pages/Onboarding'))
const LazyDashboard = React.lazy(() => import('./pages/Dashboard'))
const LazyMonitors = React.lazy(() => import('./pages/Monitors'))
const LazyUIStates = React.lazy(() => import('./pages/UIStates'))

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LazyLogin />,
  },
  {
    path: '/onboarding',
    element: <LazyOnboarding />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <LazyDashboard />
      </RequireAuth>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <RequireAuth>
        <LazyDashboard />
      </RequireAuth>
    ),
  },
  {
    path: '/monitors',
    element: (
      <RequireAuth>
        <LazyMonitors />
      </RequireAuth>
    ),
  },
  {
    path: '/states',
    element: (
      <RequireAuth>
        <LazyUIStates />
      </RequireAuth>
    ),
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
