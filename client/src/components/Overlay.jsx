// Overlay — low-level overlay primitive (ports v1 .overlay system). Esc and backdrop close it.

import React, { useState, useEffect } from 'react'

export const Overlay = ({ isOpen, onClose, children, label }) => {
  const [open, setOpen] = useState(isOpen)

  useEffect(() => {
    setOpen(isOpen)
  }, [isOpen])

  const close = () => {
    setOpen(false)
    onClose && onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  return (
    <div className="overlay open" onClick={(e) => { if (e.target === e.currentTarget) close() }} role="presentation">
      <div className="overlay-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}
