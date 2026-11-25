// Telemetry service (Part 3) — percentile/curve builders (pure) + a loader over probe rows.

const { query } = require('../lib/db')
const { getAll } = require('./settings')

const RANGES = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}
const CURVE_BUCKETS = 24
const SLOW_CALL_MS = 800
const SLOW_CALL_LIMIT = 50

// ---------- Pure helpers ----------

// Nearest-rank percentile over an array of numbers (p in 0..100). Returns null for empty input.
function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[Math.min(rank, sorted.length) - 1]
}

// probes: [{ at: Date, latencyMs, ok }] → stats over the whole window.
function buildStats(probes, thresholdMs) {
  const latencies = probes.map((p) => p.latencyMs)
  const failed = probes.filter((p) => !p.ok).length
  const breaches = probes.filter((p) => p.latencyMs > thresholdMs).length
  return {
    p50: percentile(latencies, 50),
    p99: percentile(latencies, 99),
    slaBreaches: breaches,
    slaCompliance: probes.length ? round2(100 - (breaches / probes.length) * 100) : null,
    errorRate: probes.length ? round2((failed / probes.length) * 100) : null, // percent
    total: probes.length,
  }
}

// Splits [from, to) into equal buckets; each point carries the bucket's p99 and breach flag.
function buildCurve(probes, fromMs, toMs, thresholdMs, buckets = CURVE_BUCKETS) {
  const width = (toMs - fromMs) / buckets
  const groups = Array.from({ length: buckets }, () => [])
  for (const p of probes) {
    const idx = Math.floor((p.at.getTime() - fromMs) / width)
    if (idx >= 0 && idx < buckets) groups[idx].push(p.latencyMs)
  }
  return groups.map((g, i) => {
    const p99 = percentile(g, 99)
    return {
      t: new Date(fromMs + i * width + width / 2).toISOString(),
      p99,
      count: g.length,
      breached: p99 !== null && p99 > thresholdMs,
    }
  })
}

// Leading run of probes (newest first) whose latency exceeds the threshold.
function consecutiveSlow(probesNewestFirst, thresholdMs) {
  let n = 0
  for (const p of probesNewestFirst) {
    if (p.latencyMs > thresholdMs) n++
    else break
  }
  return n
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ---------- Loader ----------

async function load({ range = '24h', monitorId = null, userId = null } = {}) {
  const settings = await getAll(userId)
  const thresholdMs = Number(settings.latencyThresholdMs)
  const consecutiveTrigger = Number(settings.consecutiveSlow)

  const toMs = Date.now()
  const fromMs = toMs - RANGES[range]
  const from = new Date(fromMs)

  const [probeRes, slowRes, monitorsRes, recentRes] = await Promise.all([
    query(
      `SELECT p.at, p.latency_ms, p.ok FROM probe p
       JOIN monitor m ON m.id = p.monitor_id
       WHERE m.user_id = $1 AND p.at >= $2 AND p.latency_ms IS NOT NULL
         ${monitorId ? 'AND p.monitor_id = $3' : ''}`,
      monitorId ? [userId, from, monitorId] : [userId, from]
    ),
    query(
      `SELECT p.id, p.at, p.latency_ms, p.status_code, p.ok, p.error, m.id AS monitor_id, m.name AS monitor_name, m.url
       FROM probe p JOIN monitor m ON m.id = p.monitor_id
       WHERE m.user_id = $1 AND p.at >= $2 AND p.latency_ms > ${SLOW_CALL_MS}
         ${monitorId ? 'AND p.monitor_id = $3' : ''}
       ORDER BY p.at DESC LIMIT ${SLOW_CALL_LIMIT}`,
      monitorId ? [userId, from, monitorId] : [userId, from]
    ),
    query(
      `SELECT id, name, type, url, timeout_ms, retries, cache_enabled FROM monitor
       WHERE user_id = $1 ORDER BY created_at, name`,
      [userId]
    ),
    // Most recent 20 probes per monitor, for the consecutive-slow alert.
    query(
      `SELECT monitor_id, latency_ms FROM (
         SELECT p.monitor_id, p.latency_ms, p.at,
                ROW_NUMBER() OVER (PARTITION BY p.monitor_id ORDER BY p.at DESC) AS rn
         FROM probe p JOIN monitor m ON m.id = p.monitor_id
         WHERE m.user_id = $1 ${monitorId ? 'AND p.monitor_id = $2' : ''}
       ) t WHERE rn <= 20 ORDER BY monitor_id, at DESC`,
      monitorId ? [userId, monitorId] : [userId]
    ),
  ])

  const probes = probeRes.rows.map((r) => ({ at: new Date(r.at), latencyMs: r.latency_ms, ok: r.ok }))

  // Pick the monitor with the longest current slow streak.
  const byMonitor = new Map()
  for (const r of recentRes.rows) {
    if (!byMonitor.has(r.monitor_id)) byMonitor.set(r.monitor_id, [])
    byMonitor.get(r.monitor_id).push({ latencyMs: r.latency_ms })
  }
  let worst = { monitorId: null, consecutive: 0 }
  for (const [id, list] of byMonitor) {
    const n = consecutiveSlow(list, thresholdMs)
    if (n > worst.consecutive) worst = { monitorId: id, consecutive: n }
  }
  const alertMonitor = monitorsRes.rows.find((m) => m.id === worst.monitorId) || null
  const alertActive = worst.consecutive >= consecutiveTrigger

  // Link the alert to the open latency incident (if any) so the client can start recovery.
  let incidentId = null
  if (alertMonitor) {
    const inc = await query(
      `SELECT id FROM incident WHERE monitor_id = $1 AND type = 'latency'
       AND status NOT IN ('resolved', 'failed') ORDER BY opened_at DESC LIMIT 1`,
      [alertMonitor.id]
    )
    incidentId = inc.rows[0]?.id || null
  }

  return {
    range,
    monitorId,
    threshold: thresholdMs,
    stats: buildStats(probes, thresholdMs),
    curve: buildCurve(probes, fromMs, toMs, thresholdMs),
    slowCalls: slowRes.rows.map((r) => ({
      id: r.id,
      at: r.at,
      latencyMs: r.latency_ms,
      statusCode: r.status_code,
      ok: r.ok,
      error: r.error || null,
      monitorId: r.monitor_id,
      monitorName: r.monitor_name,
      url: r.url,
    })),
    alert: {
      active: alertActive,
      consecutive: worst.consecutive,
      trigger: consecutiveTrigger,
      threshold: thresholdMs,
      monitorId: alertMonitor?.id || null,
      monitorName: alertMonitor?.name || null,
      url: alertMonitor?.url || null,
      incidentId,
    },
    monitors: monitorsRes.rows,
  }
}

module.exports = { RANGES, percentile, buildStats, buildCurve, consecutiveSlow, load }
