// App.jsx — React Router with all 12 lazy routes

import React from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'

const LazyLogin = React.lazy(() => import('./pages/Login'))
const LazyOnboarding = React.lazy(() => import('./pages/Onboarding'))
const LazyDashboard = React.lazy(() => import('./pages/Dashboard'))
const LazyMonitors = React.lazy(() => import('./pages/Monitors'))
const LazyUIStates = React.lazy(() => import('./pages/UIStates'))
const LazyIncidents = React.lazy(() => import('./pages/Incidents'))
const LazyDiffApproval = React.lazy(() => import('./pages/DiffApproval'))
const LazyRecommendations = React.lazy(() => import('./pages/Recommendations'))
const LazyTelemetry = React.lazy(() => import('./pages/Telemetry'))
const LazyDependencies = React.lazy(() => import('./pages/Dependencies'))
const LazyHistory = React.lazy(() => import('./pages/History'))
const LazySettings = React.lazy(() => import('./pages/Settings'))

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LazyLogin />,
    hasOutlet: false,
  },
  {
    path: '/onboarding',
    element: <LazyOnboarding />,
    hasOutlet: false,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <LazyDashboard />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/dashboard',
    element: (
      <RequireAuth>
        <LazyDashboard />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/monitors',
    element: (
      <RequireAuth>
        <LazyMonitors />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/states',
    element: (
      <RequireAuth>
        <LazyUIStates />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/incidents',
    element: (
      <RequireAuth>
        <LazyIncidents />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/diff',
    element: (
      <RequireAuth>
        <LazyDiffApproval />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/recommendations',
    element: (
      <RequireAuth>
        <LazyRecommendations />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/telemetry',
    element: (
      <RequireAuth>
        <LazyTelemetry />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/dependencies',
    element: (
      <RequireAuth>
        <LazyDependencies />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/history',
    element: (
      <RequireAuth>
        <LazyHistory />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
  {
    path: '/settings',
    element: (
      <RequireAuth>
        <LazySettings />
      </RequireAuth>
    ),
    hasOutlet: false,
  },
])

export default function App() {
  return <RouterProvider router={router} />
}