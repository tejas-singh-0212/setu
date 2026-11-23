// RequireAuth — wraps protected routes; redirects to /login on 401

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const RequireAuth = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        setAuthChecked(true)
        if (!res.ok) {
          navigate('/login', { state: { from: location } })
        }
      } catch (e) {
        setAuthChecked(true)
        navigate('/login', { state: { from: location } })
      }
    })()
  }, [navigate, location])

  if (!authChecked) return <div className="skeleton rows={3}" />
  return children
}