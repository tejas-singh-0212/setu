// Monitors CRUD service — uses pg pool for database operations

const dns = require('dns').promises
const net = require('net')
const { Pool } = require('pg')
const { query, execute } = require('../lib/db')
const settingsSvc = require('./settings')

const { isPrivateIp } = require('../lib/netGuard')

// ---------- SSRF guard: monitor URLs must be public http(s) targets ----------
// First line of defence at creation (clear 400 for the user). Probes enforce
// the same rule again at connect time and on every redirect hop
// (lib/netGuard.safeFetch), which also covers DNS rebinding.

function badRequest(message) {
  const e = new Error(message)
  e.status = 400
  return e
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
  // Monitors are passive probes: only safe, non-mutating methods. A monitor
  // fires automatically on a schedule (with retries), so state-changing
  // methods (PUT/PATCH/DELETE) could mutate the target by accident.
  if (!['GET', 'POST'].includes(method)) {
    throw badRequest('Only GET and POST methods are supported for monitors')
  }
  const url = await assertPublicUrl(data.url) // SSRF guard

  // New monitors default to the user's Settings → Telemetry → probe interval
  const defaultInterval = Number(await settingsSvc.getSetting('probeIntervalDefault', userId)) || 60
  const defaultData = {
    interval_sec: data.intervalSec || defaultInterval || 60,
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

async function getById(id, userId) {
  const result = await query('SELECT * FROM monitor WHERE id = $1 AND user_id = $2', [id, userId])
  return result.rows[0]
}

module.exports = { listFor, create, update, delete: deleteMon, getById, assertPublicUrl }