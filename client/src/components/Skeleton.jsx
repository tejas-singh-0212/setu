// Skeleton — loading placeholders

import React from 'react'

export const Skeleton = ({ type = 'text', lines = 3, width = '100%' }) => {
  const base = 'animate-pulse rounded bg-slate-200'
  if (type === 'card') {
    return <div className={`${base} h-48 w-full`} style={{ width }} />
  }
  if (type === 'tableRow') {
    return <div className={`${base} h-8 w-full`} style={{ width }} />
  }
  // text: render N lines
  return (
    <div className="flex flex-col gap-2" style={{ width }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`${base} h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}
