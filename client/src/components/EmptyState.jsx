// EmptyState — empty state with optional action (context.md §5.12)

import React from 'react'
import { Inbox, Plus } from 'lucide-react'

export const EmptyState = ({ title, description, actionLabel, onAction, icon: Icon = Inbox }) => (
  <div className="flex flex-col items-center text-center py-12 px-6">
    <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center mb-4">
      <Icon size={22} aria-hidden="true" />
    </span>
    <h3 className="text-lg font-semibold text-ink">{title}</h3>
    {description && <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>}
    {actionLabel && (
      <button className="btn-primary mt-6" onClick={onAction}>
        <Plus size={16} aria-hidden="true" /> {actionLabel}
      </button>
    )}
  </div>
)
