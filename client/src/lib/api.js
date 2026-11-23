// API client — fetch wrapper with credentials and JSON
// All requests go through the Vite proxy to http://localhost:4000

const API_BASE = ''

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${API_BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const e = new Error(err.message || `Request failed (${res.status})`)
    e.status = res.status
    throw e
  }
  if (res.status === 204) return null
  return res.json()
}

export const get = (path) => request('GET', path)
export const post = (path, body) => request('POST', path, body)
export const patch = (path, body) => request('PATCH', path, body)
export const del = (path) => request('DELETE', path)
