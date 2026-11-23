// Anomaly detection service — latency & error burst detection

const { query } = require('../lib/db')

async function getSetting(key) {
  const result = await query("SELECT value FROM setting WHERE key = $1", [key])
  return result.rows.length ? result.rows[0].value : null
}

async function createIncidentIfNotExists(pool, monitorId, type, severity, title, probableCause) {
  // Check for an open incident of this type for this monitor
  const existing = await query(
    `SELECT id FROM incident WHERE monitor_id = $1 AND type = $2 AND status = 'open' LIMIT 1`,
    [monitorId, type]
  )
  if (existing.rows.length) return

  const result = await query(
    `INSERT INTO incident (monitor_id, type, severity, title, probable_cause, status)
     VALUES ($1, $2, $3, $4, $5, 'open') RETURNING id`,
    [monitorId, type, severity, title, probableCause]
  )

  await query(
    `INSERT INTO incidentevent (incident_id, kind, actor, payload)
     VALUES ($1, 'detected', 'system', $2::jsonb)`,
    [result.rows[0].id, JSON.stringify({ source: 'probe' })]
  )
}

async function evaluate(probe) {
  const [thresholdResult, consecutiveResult] = await Promise.all([
    getSetting('latencyThresholdMs'),
    getSetting('consecutiveSlow'),
  ])

  const threshold = (thresholdResult && typeof thresholdResult === 'object' && thresholdResult !== null)
    ? thresholdResult
    : 1000
  const consecutiveSlow = (consecutiveResult && typeof consecutiveResult === 'object' && consecutiveResult !== null)
    ? consecutiveResult
    : 3

  const { monitor } = probe

  // Latency anomaly: probe latency > threshold
  if (probe.latency_ms > threshold) {
    // Check consecutive slow probes for this monitor
    const recent = await query(
      `SELECT latency_ms FROM probe WHERE monitor_id = $1 ORDER BY at DESC LIMIT $2`,
      [monitor.id, consecutiveSlow]
    )
    const slowCount = recent.rows.filter((r) => r.latency_ms > threshold).length
    if (slowCount >= consecutiveSlow) {
      await createIncidentIfNotExists(
        null,
        monitor.id,
        'latency',
        'medium',
        `High latency on ${monitor.name}`,
        `${slowCount} consecutive calls >${threshold}ms`
      )
    }
  }

  // Error burst: count 5xx probes in last 5 minutes
  if (probe.status_code && probe.status_code >= 500) {
    const burstCount = await query(
      `SELECT count(*) as cnt FROM probe WHERE monitor_id = $1 AND status_code >= 500 AND at >= NOW() - INTERVAL '5 minutes'`,
      [monitor.id]
    )
    const count = parseInt(burstCount.rows[0].cnt, 10)
    if (count >= 3) {
      await createIncidentIfNotExists(
        null,
        monitor.id,
        'error',
        'high',
        `5xx error burst on ${monitor.name}`,
        `${count} 5xx responses in 5 minutes`
      )
    }
  }
}

module.exports = { evaluate }
