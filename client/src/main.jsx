// main.jsx — React root

import { createRoot } from 'react-dom'
import { BrowserRouter } from 'react-router-dom'
import { Suspense } from 'react'
import App from './App'
import './styles/index.css' // Inter font + Tailwind

const container = document.getElementById('root')
createRoot(container).render(
  <BrowserRouter>
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-6">Loading application...</div>}>
      <App />
    </Suspense>
  </BrowserRouter>
)