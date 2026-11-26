// ErrorState — error state with retry button (context.md §5.12)

import React from 'react'
import { WifiOff, RotateCw } from 'lucide-react'

export const ErrorState = ({ onRetry, title = 'Lost connection to API', description = 'Setu could not reach the server. Check your connection and try again.' }) => (
  <div className="flex flex-col items-center text-center py-12 px-6" role="alert">
    <span className="w-12 h-12 rounded-2xl bg-bad/10 text-bad flex items-center justify-center mb-4">
      <WifiOff size={22} aria-hidden="true" />
    </span>
    <h3 className="text-lg font-semibold text-ink">{title}</h3>
    <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>
    {onRetry && (
      <button className="btn-primary mt-6" onClick={onRetry}>
        <RotateCw size={16} aria-hidden="true" /> Retry
      </button>
    )}
  </div>
)
