// Overlay — low-level overlay primitive (ports v1 .overlay system)

import React, { useState, useEffect } from 'react'

export const Overlay = ({ isOpen, onClose, children }) => {
  const [open, setOpen] = useState(isOpen)

  useEffect(() => {
    setOpen(isOpen)
  }, [isOpen])

  const handleClose = (e) => {
    // Only close when clicking the backdrop, not the content
    if (e.target === e.currentTarget) {
      setOpen(false)
      onClose && onClose()
    }
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleClose}>
      <div className="overlay-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
