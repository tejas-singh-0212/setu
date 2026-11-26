// Probes service — uses pg pool for database operations

const fs = require('fs')
const path = require('path')
const { query, execute, pool } = require('../lib/db')
const anomaly = require('./anomaly')
const dns = require('dns')
const net = require('net')
const tls = require('tls')
const { safeFetch, guardedLookup } = require('../lib/netGuard')

// Load afterProbe hooks (C2 contract): hooks/afterProbe/*.js
// ctx = { monitor, probe, payload, pool }
function loadAfterProbeHooks() {
  const hooksDir = path.join(__dirname, '../hooks/afterProbe')
  try {
    return fs
      .readdirSync(hooksDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => require(path.join(hooksDir, f)))
  } catch (e) {
    console.error('Failed to load afterProbe hooks:', e)
    return []
  }
}

const afterProbeHooks = loadAfterProbeHooks()

// Maximum response body we buffer for schema extraction (1 MB).
// Real JSON API responses are far smaller; this only guards against pathological
// payloads (huge arrays, binary content) taking the process down.
const MAX_PAYLOAD_BYTES = 1024 * 1024

// Parse the response body so afterProbe hooks can diff the schema.
// Never throws: a missing, oversized or non-JSON body yields null, which hooks
// must treat as "no payload available" rather than as a schema change.
function parsePayload(body, monitor, ok) {
  // Website probes return HTML, which carries no API schema worth diffing.
  if (monitor.type !== 'api') return null
  // An error response is not the contract we monitor; skip it so a 5xx body is
  // never mistaken for schema drift.
  if (!ok || !body) return null
  try {
    return JSON.parse(body)
  } catch (e) {
    return null
  }
}

async function runProbe(monitor) {
  const url = new URL(monitor.url)
  const hostname = url.hostname
  const protocol = url.protocol.replace(':', '')

  let statusCode, latencyMs, ok, error = '', schemaOk = true, dnsOk = true, sslDaysLeft = null
  let responsePayload = null

  const start = Date.now()

  // DNS check
  try {
    await new Promise((resolve, reject) => {
      dns.resolve4(hostname, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    dnsOk = true
  } catch (e) {
    dnsOk = false
  }

  // HTTP/HTTPS request
  try {
    // SSRF-safe: every hop (redirects included) is re-validated and the
    // resolved address is checked at connect time (DNS rebinding). The
    // timeout covers headers AND body, so a stalled body is still aborted.
    const response = await safeFetch(monitor.url, {
      method: monitor.method || 'GET',
      timeoutMs: monitor.timeout_ms || 5000,
      readBody: monitor.type === 'api',
      maxBytes: MAX_PAYLOAD_BYTES,
    })
    statusCode = response.status
    latencyMs = response.headersAt - start
    ok = statusCode < 400
    responsePayload = parsePayload(response.body, monitor, ok)

    // SSL days left (for HTTPS)
    if (protocol === 'https') {
      try {
        await new Promise((resolve, reject) => {
          const session = tls.connect({
            host: hostname,
            port: Number(url.port) || 443,
            servername: net.isIP(hostname) ? undefined : hostname,
            lookup: guardedLookup,
            rejectUnauthorized: false,
          })
          session.on('secureConnect', () => {
            const cert = session.getPeerCertificate()
            if (cert && cert.valid_to) {
              const expires = new Date(cert.valid_to)
              const now = new Date()
              sslDaysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
            }
            session.destroy()
            resolve()
          })
          session.on('error', () => {
            sslDaysLeft = 0
            session.destroy()
            resolve()
          })
          session.setTimeout(3000, () => {
            sslDaysLeft = 0
            session.destroy()
            resolve()
          })
        })
      } catch (e) {
        sslDaysLeft = 0
      }
    }
  } catch (err) {
    latencyMs = Date.now() - start
    statusCode = 0
    ok = false
    error = err.message || 'Request failed'
  }

  // Create probe record
  const result = await execute(
    `INSERT INTO probe (monitor_id, ok, status_code, latency_ms, schema_ok, error, dns_ok, ssl_days_left)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      monitor.id,
      ok,
      statusCode,
      latencyMs,
      schemaOk,
      error,
      dnsOk,
      sslDaysLeft,
    ]
  )

  // Update monitor last_probed_at
  await execute(
    `UPDATE monitor SET last_probed_at = NOW() WHERE id = $1`,
    [monitor.id]
  )

  // Update health score
  const monitorResult = await query('SELECT health_score FROM monitor WHERE id = $1', [monitor.id])
  const currentHealth = monitorResult.rows[0]?.health_score || 100

  let newHealth = currentHealth
  if (!ok) newHealth = Math.max(currentHealth - 5, 0)
  if (statusCode && statusCode >= 500) newHealth = Math.max(currentHealth - 10, 0)
  if (latencyMs && latencyMs > 1000) newHealth = Math.max(currentHealth - 3, 0)

  await execute(
    `UPDATE monitor SET health_score = $1 WHERE id = $2`,
    [newHealth, monitor.id]
  )

  const probe = result.rows[0]

  // Run afterProbe hooks (C2 contract)
  // payload is the parsed response body: null for websites, failed probes and
  // non-JSON responses. Hooks must handle null explicitly.
  const ctx = { monitor, probe, payload: responsePayload, pool }
  for (const hook of afterProbeHooks) {
    try {
      await hook.run(ctx)
    } catch (e) {
      console.error(`After-probe hook "${hook.name}" failed:`, e)
    }
  }

  // Run anomaly detection (needs the monitor row, not just the probe)
  try {
    await anomaly.evaluate(probe, monitor)
  } catch (e) {
    console.error(`Anomaly evaluation failed for monitor ${monitor.id}:`, e)
  }

  return probe
}

const RANGE_MS = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 }

async function getHistory(monitorId, range = '24h', userId = null) {
  const ms = RANGE_MS[range] || RANGE_MS['24h']
  const from = new Date(Date.now() - ms)

  const result = await query(
    `SELECT p.* FROM probe p
     JOIN monitor m ON m.id = p.monitor_id
     WHERE m.user_id = $1
       AND ($2::uuid IS NULL OR p.monitor_id = $2)
       AND p.at >= $3
     ORDER BY p.at DESC
     LIMIT 500`,
    [userId, monitorId || null, from]
  )
  return result.rows
}

module.exports = { runProbe, getHistory }
