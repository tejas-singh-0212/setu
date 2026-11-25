// Modal — overlay modal primitive (ports v1 .overlay system)

import React, { useEffect, useState } from 'react'

export const Modal = ({ isOpen, onClose, title, children, footer }) => {
  const [open, setOpen] = useState(isOpen)

  // Stay in sync with the parent (re-openable after close)
  useEffect(() => { setOpen(isOpen) }, [isOpen])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setOpen(false)
    onClose && onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleClose} role="presentation">
      <div
        className="overlay-content !max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <button
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-1 -m-1"
            onClick={handleClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="mb-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 mt-4">{footer}</div>}
      </div>
    </div>
  )
}
