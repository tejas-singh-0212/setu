// Dependency checks (Part 3) — shared by routes/dependencies.js and hooks/scheduled/dependencyChecks.js.
// Runs DNS + SSL for one monitor, stores a dependencycheck row, and opens an SSL-expiry
// dependency incident when the certificate expires within SSL_WARN_DAYS.

const { query, pool } = require('../../lib/db')
const { checkDns } = require('./dns')
const { checkSsl } = require('./ssl')

const SSL_WARN_DAYS = 14

function parseUrl(monitor) {
  try {
    const u = new URL(monitor.url)
    return { host: u.hostname, port: Number(u.port) || 443, isHttps: u.protocol === 'https:' }
  } catch {
    return { host: null, port: 443, isHttps: false }
  }
}

// Rate limiting is inferred from probes: any HTTP 429 in the last hour.
async function isRateLimited(monitorId) {
  const { rows } = await query(
    `SELECT 1 FROM probe WHERE monitor_id = $1 AND status_code = 429 AND at >= NOW() - INTERVAL '1 hour' LIMIT 1`,
    [monitorId]
  )
  return rows.length > 0
}

// Opens a dependency incident (+ 'detected' event) unless one is already open for this monitor.
async function ensureSslIncident(monitor, daysLeft) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialise concurrent checks of the same monitor so only one incident is opened.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ssl-incident:${monitor.id}`])
    const open = await client.query(
      `SELECT id FROM incident
       WHERE monitor_id = $1 AND type = 'dependency' AND status NOT IN ('resolved', 'failed')
       LIMIT 1`,
      [monitor.id]
    )
    if (open.rows.length) {
      await client.query('COMMIT')
      return null
    }
    const cause = `SSL cert expires in ${daysLeft} days`
    const { rows } = await client.query(
      `INSERT INTO incident (monitor_id, type, severity, title, probable_cause, status)
       VALUES ($1, 'dependency', $2, $3, $4, 'open') RETURNING *`,
      [monitor.id, daysLeft <= 3 ? 'high' : 'low', `SSL certificate expiring on ${monitor.name}`, cause]
    )
    await client.query(
      `INSERT INTO incidentevent (incident_id, kind, actor, payload)
       VALUES ($1, 'detected', 'system', $2::jsonb)`,
      [rows[0].id, JSON.stringify({ source: 'dependency-checks', sslDaysLeft: daysLeft })]
    )
    await client.query('COMMIT')
    return rows[0]
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// Runs DNS + SSL for one monitor row (snake_case columns as returned by pg).
async function checkMonitor(monitor) {
  const { host, port, isHttps } = parseUrl(monitor)

  const [dnsResult, sslResult, rateLimited] = await Promise.all([
    host ? checkDns(host) : { dnsOk: false, upstreamHosts: { hosts: [] } },
    host && isHttps ? checkSsl(host, port) : { sslIssuer: null, sslExpiresAt: null, sslDaysLeft: null },
    isRateLimited(monitor.id),
  ])

  const { rows } = await query(
    `INSERT INTO dependencycheck (monitor_id, dns_ok, ssl_issuer, ssl_expires_at, ssl_days_left, upstream_hosts, rate_limited)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
    [
      monitor.id,
      dnsResult.dnsOk,
      sslResult.sslIssuer,
      sslResult.sslExpiresAt,
      sslResult.sslDaysLeft,
      JSON.stringify(dnsResult.upstreamHosts),
      rateLimited,
    ]
  )

  let incident = null
  if (sslResult.sslDaysLeft !== null && sslResult.sslDaysLeft <= SSL_WARN_DAYS) {
    incident = await ensureSslIncident(monitor, sslResult.sslDaysLeft)
  }

  return { check: rows[0], incident }
}

// Runs checks for every active monitor; one failing monitor never stops the others.
async function checkAllActive() {
  const { rows: monitors } = await query(`SELECT * FROM monitor WHERE status = 'active'`)
  const results = []
  for (const monitor of monitors) {
    try {
      results.push(await checkMonitor(monitor))
    } catch (e) {
      console.error(`Dependency check failed for monitor ${monitor.id}:`, e.message)
    }
  }
  return results
}

module.exports = { SSL_WARN_DAYS, checkMonitor, checkAllActive }
