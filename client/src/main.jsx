// main.jsx — React root

import { createRoot } from 'react-dom/client'
import { Suspense } from 'react'
import App from './App'
import './styles/index.css'

const container = document.getElementById('root')
createRoot(container).render(
  <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-6">Loading application...</div>}>
    <App />
  </Suspense>
)