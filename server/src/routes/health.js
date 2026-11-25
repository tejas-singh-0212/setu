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
    const userId = req.session.userId
    const [counts, openIncidents, avgHealth, avgResponse, depWarnings, recent, resolvedRes] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE type = 'api')::int AS api,
                COUNT(*) FILTER (WHERE type = 'website')::int AS website
         FROM monitor WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM incident i
         JOIN monitor m ON m.id = i.monitor_id
         WHERE m.user_id = $1 AND i.status NOT IN ('resolved', 'failed')`,
        [userId]
      ),
      query(
        `SELECT COALESCE(AVG(health_score), 0)::int AS avg FROM monitor
         WHERE user_id = $1 AND last_probed_at IS NOT NULL`,
        [userId]
      ),
      query(
        `SELECT COALESCE(AVG(p.latency_ms), 0)::int AS avg FROM probe p
         JOIN monitor m ON m.id = p.monitor_id
         WHERE m.user_id = $1 AND p.at >= NOW() - INTERVAL '24 hours' AND p.ok = true`,
        [userId]
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT DISTINCT dc.monitor_id FROM dependencycheck dc
           JOIN monitor m ON m.id = dc.monitor_id
           WHERE m.user_id = $1
             AND dc.id = (
               SELECT id FROM dependencycheck WHERE monitor_id = dc.monitor_id ORDER BY at DESC LIMIT 1
             ) AND (dc.dns_ok = false OR dc.rate_limited = true OR (dc.ssl_days_left IS NOT NULL AND dc.ssl_days_left <= 14))
         ) t`,
        [userId]
      ),
      query(
        `SELECT i.id, i.title, i.type, i.severity, i.status, i.probable_cause, i.opened_at,
                m.id AS monitor_id, m.name AS monitor_name
         FROM incident i
         JOIN monitor m ON m.id = i.monitor_id
         WHERE m.user_id = $1 AND i.status NOT IN ('resolved', 'failed')
         ORDER BY i.opened_at DESC
         LIMIT 5`,
        [userId]
      ),
      query(
        `SELECT i.id, i.title, i.type, i.severity, i.status, i.closed_at,
                m.id AS monitor_id, m.name AS monitor_name
         FROM incident i
         JOIN monitor m ON m.id = i.monitor_id
         WHERE m.user_id = $1 AND i.status = 'resolved' AND i.closed_at >= NOW() - INTERVAL '6 hours'
         ORDER BY i.closed_at DESC
         LIMIT 1`,
        [userId]
      ),
    ])

    const p99 = await query(
      `SELECT COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY p.latency_ms), 0)::int AS p99
       FROM probe p JOIN monitor m ON m.id = p.monitor_id
       WHERE m.user_id = $1 AND p.at >= NOW() - INTERVAL '24 hours' AND p.ok = true`,
      [userId]
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
