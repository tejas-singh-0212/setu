// Probes service — uses pg pool for database operations

const fs = require('fs')
const path = require('path')
const { query, execute } = require('../lib/db')
const anomaly = require('./anomaly')
const dns = require('dns')
const tls = require('tls')

// Load afterProbe hooks (C2 contract): hooks/afterProbe/*.js
// ctx = { monitor, probe, pool }
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

async function runProbe(monitor) {
  const url = new URL(monitor.url)
  const hostname = url.hostname
  const protocol = url.protocol.replace(':')

  let statusCode, latencyMs, ok, error = '', schemaOk = true, dnsOk = true, sslDaysLeft = null

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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), monitor.timeout_ms || 5000)

    const response = await fetch(monitor.url, {
      method: monitor.method || 'GET',
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeoutId)

    statusCode = response.status
    latencyMs = Date.now() - start
    ok = statusCode < 400

    // SSL days left (for HTTPS)
    if (protocol === 'https') {
      try {
        await new Promise((resolve, reject) => {
          const session = tls.connect({
            host: hostname,
            port: 443,
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
  const ctx = { monitor, probe, pool }
  for (const hook of afterProbeHooks) {
    try {
      await hook.run(ctx)
    } catch (e) {
      console.error(`After-probe hook "${hook.name}" failed:`, e)
    }
  }

  // Run anomaly detection
  try {
    await anomaly.evaluate(probe)
  } catch (e) {
    console.error(`Anomaly evaluation failed for monitor ${monitor.id}:`, e)
  }

  return probe
}

async function getHistory(monitorId, range = '24h') {
  const now = new Date()
  const from = new Date()
  from.setHours(now.getHours() - 24)

  const result = await query(
    `SELECT * FROM probe WHERE monitor_id = $1 AND at >= $2 ORDER BY at DESC LIMIT 100`,
    [monitorId, from]
  )
  return result.rows
}

module.exports = { runProbe, getHistory }
