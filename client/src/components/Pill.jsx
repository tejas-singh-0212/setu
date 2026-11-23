// Pill — styled badge pill

import React from 'react'

export const Pill = ({ variant = 'neutral', children }) => {
  const variants = {
    ok: 'pill-ok',
    warn: 'pill-warn',
    bad: 'pill-bad',
    ai: 'pill-ai',
    neutral: 'pill-neutral',
  }

  return (
    <span className={variants[variant] || variants.neutral}>
      {children}
    </span>
  )
}

Pill.defaultProps = { variant: 'neutral' }