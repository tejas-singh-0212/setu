// GET /api/health — dashboard aggregates (context.md §5.3)

const router = require('express').Router()
const { query } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

const TIME_UNITS = [
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
  ['second', 1000],
]

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  for (const [unit, ms] of TIME_UNITS) {
    if (diff >= ms) {
      const n = Math.floor(diff / ms)
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`
    }
  }
  return 'just now'
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [counts, openIncidents, avgHealth, avgResponse, depWarnings, recent, resolvedRes] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE type = 'api')::int AS api,
                COUNT(*) FILTER (WHERE type = 'website')::int AS website
         FROM monitor`
      ),
      query(`SELECT COUNT(*)::int AS n FROM incident WHERE status NOT IN ('resolved', 'failed')`),
      query(`SELECT COALESCE(AVG(health_score), 0)::int AS avg FROM monitor WHERE last_probed_at IS NOT NULL`),
      query(
        `SELECT COALESCE(AVG(latency_ms), 0)::int AS avg FROM probe
         WHERE at >= NOW() - INTERVAL '24 hours' AND ok = true`
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT DISTINCT monitor_id FROM dependencycheck dc
           WHERE dc.id = (
             SELECT id FROM dependencycheck WHERE monitor_id = dc.monitor_id ORDER BY at DESC LIMIT 1
           ) AND (dns_ok = false OR rate_limited = true OR (ssl_days_left IS NOT NULL AND ssl_days_left <= 14))
         ) t`
      ),
      query(
        `SELECT i.id, i.title, i.type, i.severity, i.status, i.probable_cause, i.opened_at,
                m.id AS monitor_id, m.name AS monitor_name
         FROM incident i
         JOIN monitor m ON m.id = i.monitor_id
         WHERE i.status NOT IN ('resolved', 'failed')
         ORDER BY i.opened_at DESC
         LIMIT 5`
      ),
      query(
        `SELECT i.id, i.title, i.type, i.severity, i.status, i.closed_at,
                m.id AS monitor_id, m.name AS monitor_name
         FROM incident i
         JOIN monitor m ON m.id = i.monitor_id
         WHERE i.status = 'resolved' AND i.closed_at >= NOW() - INTERVAL '6 hours'
         ORDER BY i.closed_at DESC
         LIMIT 1`
      ),
    ])

    const p99 = await query(
      `SELECT COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p99
       FROM probe WHERE at >= NOW() - INTERVAL '24 hours' AND ok = true`
    )

    const openFeed = recent.rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      severity: r.severity,
      status: r.status,
      probableCause: r.probable_cause,
      monitorId: r.monitor_id,
      monitorName: r.monitor_name,
      openedAt: r.opened_at,
      time: timeAgo(r.opened_at),
      kind: 'incident',
    }))

    const resolved = resolvedRes.rows[0]
    if (resolved) {
      openFeed.push({
        id: resolved.id,
        title: `Recovery applied & verified on ${resolved.monitor_name}`,
        type: resolved.type,
        severity: 'ok',
        status: 'resolved',
        probableCause: null,
        monitorId: resolved.monitor_id,
        monitorName: resolved.monitor_name,
        openedAt: resolved.closed_at,
        time: timeAgo(resolved.closed_at),
        kind: 'recovery',
      })
    }

    res.json({
      monitorCount: counts.rows[0],
      openIncidents: openIncidents.rows[0].n,
      avgHealthScore: avgHealth.rows[0].avg,
      avgResponseTime: avgResponse.rows[0].avg,
      p99ResponseTime: p99.rows[0].p99,
      dependencyWarningCount: depWarnings.rows[0].n,
      lastProbeAt: null,
      recentIncidents: openFeed,
    })
  } catch (e) {
    next(e)
  }
})

module.exports = router
