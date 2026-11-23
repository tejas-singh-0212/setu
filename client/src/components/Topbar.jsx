// Topbar — Setu Studio, search, Healthy pill, production/staging, bell, Feedback

import React from 'react'

export const Topbar = () => (
  <header className="border-b border-slate-200 bg-white shadow-sm">
    <div className="max-w-7xl mx-auto px-6 h-14 items-center justify-between flex">
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold text-brand">Setu Studio</span>
      </div>

      <div className="hidden md:flex items-center gap-6">
        <input
          type="text"
          placeholder="Search..."
          className="input-base border rounded-l-lg flex-1"
        />
        <span className="pill-ok text-xs">● Healthy</span>

        <select className="input-base rounded-r-lg">
          <option>Production</option>
          <option>Staging</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-slate-400 text-sm">ⓘ</span>
        <button className="btn-secondary text-xs py-1 px-3">Feedback</button>
      </div>
    </div>
  </header>
)