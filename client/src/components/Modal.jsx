// Modal — overlay modal primitive (ports v1 .overlay system)

import React, { useState } from 'react'

export const Modal = ({ isOpen, onClose, title, children, footer }) => {
  const [open, setOpen] = useState(isOpen)

  const handleClose = () => {
    setOpen(false)
    onClose && onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleClose}>
      <div className="overlay-content" onClick={(e) => e.stopPropagation()}>
        <button className="overlay-content close" onClick={handleClose}>
          &times;
        </button>
        <h2 className="text-xl font-bold text-ink mb-4">{title}</h2>
        <div className="mb-4">{children}</div>
        {footer && <div className="modal-footer mt-4">{footer}</div>}
      </div>
    </div>
  )
}