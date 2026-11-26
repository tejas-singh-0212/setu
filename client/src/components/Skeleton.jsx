// Skeleton — loading placeholders

import React from 'react'

export const Skeleton = ({ type = 'text', lines = 3, width = '100%' }) => {
  const base = 'animate-pulse rounded-lg bg-slate-200/70'
  if (type === 'card') {
    return <div className={`${base} rounded-2xl h-36 w-full`} style={{ width }} aria-hidden="true" />
  }
  if (type === 'tableRow') {
    return <div className={`${base} h-10 w-full`} style={{ width }} aria-hidden="true" />
  }
  return (
    <div className="flex flex-col gap-2" style={{ width }} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`${base} h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}
