// Skeleton — loading placeholders

import React from 'react'

export const Skeleton = ({ type, lines = 3, width = '100%' }) => {
  const types = {
    card: `
      .skeleton-card {
        @apply h-24 w-full rounded-2xl bg-slate-100 animate-pulse;
      }
    `,
    tableRow: `
      .skeleton-row {
        @apply h-8 w-full rounded-mb bg-slate-100 animate-pulse;
      }
    `,
    text: `
      .skeleton-text {
        @apply h-4 w-full/6 rounded bg-slate-100 animate-pulse;
      }
    `,
  }

  return <div className={`skeleton ${type}`} style={{ width }} />
}