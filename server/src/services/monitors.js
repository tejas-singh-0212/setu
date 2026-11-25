// Monitors CRUD service — uses pg pool for database operations

const dns = require('dns').promises
const net = require('net')
const { Pool } = require('pg')
const { query, execute } = require('../lib/db')

// ---------- SSRF guard: monitor URLs must be public http(s) targets ----------
// Probes fetch whatever URL is stored, so creation is the single choke point
// (URL is not editable afterwards). Blocks localhost, private ranges, link-
// local/metadata addresses and hostnames that resolve to them.

function badRequest(message) {
  const e = new Error(message)
  e.status = 400
  return e
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // loopback
    if (a === 0) return true
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
    return false
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd')) return true // ULA
    if (v.startsWith('fe80')) return true // link-local
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return false
  }
  return false
}

async function assertPublicUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw badRequest('URL is required')
  let u
  try {
    u = new URL(rawUrl.trim())
  } catch {
    throw badRequest('Invalid URL — include the full address (https://…)')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw badRequest('Only http:// and https:// URLs are allowed')
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal') ||
    host.endsWith('.lan')
  ) {
    throw badRequest('Internal hosts are not allowed')
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw badRequest('Private or metadata addresses are not allowed')
  } else {
    let addrs
    try {
      addrs = await dns.lookup(host, { all: true })
    } catch {
      throw badRequest(`Could not resolve host "${host}"`)
    }
    if (addrs.some((a) => isPrivateIp(a.address))) {
      throw badRequest('Host resolves to a private or metadata address')
    }
  }
  return u.toString()
}

async function listFor(userId) {
  const result = await query(
    `SELECT m.*,
            lp.latency_ms AS last_latency_ms,
            avg10.avg_latency_ms AS latency_10m_ms,
            li.open_incidents AS open_incidents
     FROM monitor m
     LEFT JOIN LATERAL (
       SELECT latency_ms FROM probe WHERE monitor_id = m.id ORDER BY at DESC LIMIT 1
     ) lp ON true
     LEFT JOIN LATERAL (
       SELECT AVG(latency_ms)::int AS avg_latency_ms FROM probe
       WHERE monitor_id = m.id AND at >= NOW() - INTERVAL '10 minutes'
     ) avg10 ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS open_incidents FROM incident
       WHERE monitor_id = m.id AND status NOT IN ('resolved', 'failed')
     ) li ON true
     WHERE m.user_id = $1
     ORDER BY m.created_at, m.name`,
    [userId]
  )
  return result.rows
}

async function create(userId, data) {
  // Validation — bad input must be a 400, not a 500 from pg
  if (!data || typeof data.name !== 'string' || !data.name.trim()) {
    throw badRequest('Name is required')
  }
  const type = data.type || 'website'
  if (!['website', 'api'].includes(type)) throw badRequest('type must be "website" or "api"')
  const method = String(data.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) {
    throw badRequest('Unsupported HTTP method')
  }
  const url = await assertPublicUrl(data.url) // SSRF guard

  const defaultData = {
    interval_sec: data.intervalSec || 60,
    timeout_ms: data.timeoutMs || 5000,
    retries: data.retries ?? 0,
    cache_enabled: data.cacheEnabled ?? false,
    status: data.status === 'paused' ? 'paused' : 'active',
    health_score: 100,
  }

  const result = await execute(
    `INSERT INTO monitor (user_id, name, type, url, method, interval_sec, timeout_ms, retries, cache_enabled, status, health_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      userId,
      data.name.trim(),
      type,
      url,
      method,
      defaultData.interval_sec,
      defaultData.timeout_ms,
      defaultData.retries,
      defaultData.cache_enabled,
      defaultData.status,
      defaultData.health_score,
    ]
  )
  return result.rows[0]
}

async function update(id, data, userId) {
  // Only allow editing certain fields
  const allowed = ['name', 'interval_sec', 'timeout_ms', 'retries', 'cache_enabled', 'status']
  const updateData = {}
  for (const key of allowed) {
    if (key in data) updateData[key] = data[key]
  }
  if (Object.keys(updateData).length === 0) return null

  // Build dynamic update query — id and user_id bind at the END, each its own index
  const setCols = Object.keys(updateData).map((key, idx) => `${key} = $${idx + 1}`).join(', ')
  const values = Object.values(updateData)
  values.push(id, userId)
  const idIdx = values.length - 1
  const userIdIdx = values.length

  const result = await query(
    `UPDATE monitor SET ${setCols} WHERE id = $${idIdx} AND user_id = $${userIdIdx} RETURNING *`,
    values
  )
  return result.rows[0]
}

async function deleteMon(id, userId) {
  const result = await query(
    'DELETE FROM monitor WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  )
  return result.rows[0]
}

async function getById(id) {
  const result = await query('SELECT * FROM monitor WHERE id = $1', [id])
  return result.rows[0]
}

module.exports = { listFor, create, update, delete: deleteMon, getById, assertPublicUrl }