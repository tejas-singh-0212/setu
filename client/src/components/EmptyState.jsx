// EmptyState — empty state with action button

import React from 'react'

export const EmptyState = ({ title, description, actionLabel, onAction }) => (
  <div className="text-center py-8">
    <span className="text-4xl mb-4">📋</span>
    <h3 className="text-2xl font-bold mb-2">{title}</h3>
    <p className="text-slate-500 mb-6">{description}</p>
    {actionLabel && (
      <button
        className="btn-primary"
        onClick={onAction}
        style={{ margin: '0 auto' }}
      >
        {actionLabel}
      </button>
    )}
  </div>
)