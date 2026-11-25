// Anomaly detection service — latency & error burst detection (Part 1, fixed)
// evaluate(probe, monitor) — probe is the inserted Probe row, monitor the Monitor row.

const { query } = require('../lib/db')

async function getNumberSetting(key, fallback) {
  const result = await query('SELECT value FROM setting WHERE key = $1', [key])
  if (!result.rows.length) return fallback
  const v = result.rows[0].value
  const n = typeof v === 'object' && v !== null ? Number(v.value ?? v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

async function createIncidentIfNotExists(monitorId, type, severity, title, probableCause) {
  const existing = await query(
    `SELECT id FROM incident WHERE monitor_id = $1 AND type = $2
       AND status NOT IN ('resolved', 'failed') LIMIT 1`,
    [monitorId, type]
  )
  if (existing.rows.length) return null

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
  return result.rows[0].id
}

async function evaluate(probe, monitor) {
  if (!monitor) return
  const [threshold, consecutiveSlow] = await Promise.all([
    getNumberSetting('latencyThresholdMs', 1000),
    getNumberSetting('consecutiveSlow', 3),
  ])

  // Latency anomaly: N consecutive probes over the threshold
  if (probe.latency_ms > threshold) {
    const recent = await query(
      `SELECT latency_ms FROM probe WHERE monitor_id = $1 ORDER BY at DESC LIMIT $2`,
      [monitor.id, consecutiveSlow]
    )
    const slowCount = recent.rows.filter((r) => r.latency_ms > threshold).length
    if (slowCount >= consecutiveSlow) {
      await createIncidentIfNotExists(
        monitor.id,
        'latency',
        'medium',
        `High latency on ${monitor.name}`,
        `${slowCount} consecutive calls >${threshold}ms`
      )
    }
  }

  // Error burst: ≥3 5xx probes in the last 5 minutes
  if (probe.status_code && probe.status_code >= 500) {
    const burst = await query(
      `SELECT COUNT(*)::int AS cnt FROM probe
       WHERE monitor_id = $1 AND status_code >= 500 AND at >= NOW() - INTERVAL '5 minutes'`,
      [monitor.id]
    )
    const count = burst.rows[0].cnt
    if (count >= 3) {
      await createIncidentIfNotExists(
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
