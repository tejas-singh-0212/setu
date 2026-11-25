// API client — fetch wrapper with credentials + JSON.
// Paths may be given with or without the /api prefix; it is added once.
// Works both behind the Vite proxy and when Express serves the built client.

async function request(method, path, body) {
  const normalized = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(normalized, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const e = new Error(err.message || err.error || `Request failed (${res.status})`)
    e.status = res.status
    throw e
  }
  if (res.status === 204) return null
  return res.json()
}

export const get = (path) => request('GET', path)
export const post = (path, body) => request('POST', path, body)
export const put = (path, body) => request('PUT', path, body)
export const patch = (path, body) => request('PATCH', path, body)
export const del = (path) => request('DELETE', path)
