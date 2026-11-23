// ErrorState — error state with retry button

import React from 'react'

export const ErrorState = ({ onRetry }) => (
  <div className="text-center py-8">
    <span className="text-4xl mb-4">⚠️</span>
    <h3 className="text-2xl font-bold mb-2">Lost connection to API</h3>
    <p className="text-slate-500 mb-6">Please check your connection and try again.</p>
    <button
      className="btn-primary"
      onClick={onRetry}
      style={{ margin: '0 auto' }}
    >
      Retry
    </button>
  </div>
)