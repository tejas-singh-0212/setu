// Pill — status badge (colour + text, never colour alone)

import React from 'react'

const VARIANTS = {
  ok: 'pill-ok',
  warn: 'pill-warn',
  bad: 'pill-bad',
  ai: 'pill-ai',
  neutral: 'pill-neutral',
}

export const Pill = ({ variant = 'neutral', className = '', children }) => (
  <span className={`${VARIANTS[variant] || VARIANTS.neutral} ${className}`}>{children}</span>
)
