// App.jsx — React Router with all 12 lazy routes (C3), RequireAuth on everything
// except /login, /onboarding and /states.

import React from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'

const lazy = (p) => React.lazy(p)

const LazyLogin = lazy(() => import('./pages/Login'))
const LazyOnboarding = lazy(() => import('./pages/Onboarding'))
const LazyDashboard = lazy(() => import('./pages/Dashboard'))
const LazyMonitors = lazy(() => import('./pages/Monitors'))
const LazyIncidents = lazy(() => import('./pages/Incidents'))
const LazyDiffApproval = lazy(() => import('./pages/DiffApproval'))
const LazyRecommendations = lazy(() => import('./pages/Recommendations'))
const LazyTelemetry = lazy(() => import('./pages/Telemetry'))
const LazyDependencies = lazy(() => import('./pages/Dependencies'))
const LazyHistory = lazy(() => import('./pages/History'))
const LazySettings = lazy(() => import('./pages/Settings'))
const LazyUIStates = lazy(() => import('./pages/UIStates'))

const guarded = (element) => <RequireAuth>{element}</RequireAuth>

const router = createBrowserRouter([
  { path: '/login', element: <LazyLogin /> },
  { path: '/onboarding', element: <LazyOnboarding /> },
  { path: '/states', element: <LazyUIStates /> },
  { path: '/', element: guarded(<LazyDashboard />) },
  { path: '/dashboard', element: guarded(<LazyDashboard />) },
  { path: '/monitors', element: guarded(<LazyMonitors />) },
  { path: '/incidents', element: guarded(<LazyIncidents />) },
  { path: '/diff', element: guarded(<LazyDiffApproval />) },
  { path: '/diff/:id', element: guarded(<LazyDiffApproval />) },
  { path: '/recommendations', element: guarded(<LazyRecommendations />) },
  { path: '/telemetry', element: guarded(<LazyTelemetry />) },
  { path: '/dependencies', element: guarded(<LazyDependencies />) },
  { path: '/history', element: guarded(<LazyHistory />) },
  { path: '/settings', element: guarded(<LazySettings />) },
])

export default function App() {
  return <RouterProvider router={router} />
}
