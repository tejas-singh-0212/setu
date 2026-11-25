// /api/dependencies (Part 3) — DNS/SSL/rate-limit health per monitor.

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const { query } = require('../lib/db')
const checks = require('../services/checks')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toDto(r) {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    monitorName: r.monitor_name,
    monitorType: r.monitor_type,
    url: r.url,
    at: r.at,
    dnsOk: r.dns_ok,
    sslIssuer: r.ssl_issuer,
    sslExpiresAt: r.ssl_expires_at,
    sslDaysLeft: r.ssl_days_left,
    upstreamHosts: r.upstream_hosts?.hosts || [],
    rateLimited: r.rate_limited,
  }
}

const isWarning = (c) =>
  c.dnsOk === false || c.rateLimited || (c.sslDaysLeft !== null && c.sslDaysLeft <= checks.SSL_WARN_DAYS)

// GET / — latest check per monitor + warning count + today's counters
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId
    const [latest, today] = await Promise.all([
      query(
        `SELECT m.id AS monitor_id, m.name AS monitor_name, m.type AS monitor_type, m.url,
                dc.id, dc.at, dc.dns_ok, dc.ssl_issuer, dc.ssl_expires_at, dc.ssl_days_left,
                dc.upstream_hosts, dc.rate_limited
         FROM monitor m
         LEFT JOIN LATERAL (
           SELECT * FROM dependencycheck WHERE monitor_id = m.id ORDER BY at DESC LIMIT 1
         ) dc ON true
         WHERE m.user_id = $1
         ORDER BY m.created_at, m.name`,
        [userId]
      ),
      query(
        `SELECT COUNT(*)::int AS checks,
                COUNT(*) FILTER (WHERE dc.dns_ok = false OR dc.ssl_days_left IS NULL)::int AS failures
         FROM dependencycheck dc
         JOIN monitor m ON m.id = dc.monitor_id
         WHERE m.user_id = $1 AND dc.at >= date_trunc('day', NOW())`,
        [userId]
      ),
    ])
    const items = latest.rows.map(toDto)
    const checked = items.filter((c) => c.id)
    const expiries = checked.map((c) => c.sslDaysLeft).filter((d) => d !== null)
    res.json({
      items,
      warnings: checked.filter(isWarning).length,
      stats: {
        checksToday: today.rows[0].checks,
        failuresToday: today.rows[0].failures,
        nextExpiryDays: expiries.length ? Math.min(...expiries) : null,
      },
      sslWarnDays: checks.SSL_WARN_DAYS,
    })
  } catch (e) { next(e) }
})

// POST /remind — body { monitorId, title, why } → Recommendation(source: 'dependency')
router.post('/remind', requireAuth, async (req, res, next) => {
  try {
    const { monitorId = null, title, why } = req.body || {}
    if (typeof title !== 'string' || !title.trim() || typeof why !== 'string' || !why.trim()) {
      return res.status(400).json({ error: 'title and why are required' })
    }
    if (monitorId !== null && !UUID.test(monitorId)) return res.status(400).json({ error: 'Invalid monitorId' })
    if (monitorId) {
      const m = await query('SELECT id FROM monitor WHERE id = $1 AND user_id = $2', [monitorId, req.session.userId])
      if (!m.rows.length) return res.status(404).json({ error: 'Monitor not found' })
    }
    const { rows } = await query(
      `INSERT INTO recommendation (monitor_id, user_id, title, why, action, source, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'dependency', 'open') RETURNING *`,
      [
        monitorId,
        req.session.userId,
        title.trim().slice(0, 500),
        why.trim(),
        JSON.stringify({ kind: 'ssl_renew' }),
      ]
    )
    res.status(201).json(rows[0])
  } catch (e) { next(e) }
})

// POST /:monitorId/check — run DNS + SSL now, store the row, return it
router.post('/:monitorId/check', requireAuth, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.monitorId)) return res.status(404).json({ error: 'Monitor not found' })
    const m = await query('SELECT * FROM monitor WHERE id = $1 AND user_id = $2', [
      req.params.monitorId,
      req.session.userId,
    ])
    if (!m.rows.length) return res.status(404).json({ error: 'Monitor not found' })
    const monitor = m.rows[0]
    const { check, incident } = await checks.checkMonitor(monitor)
    res.json({
      check: toDto({ ...check, monitor_name: monitor.name, monitor_type: monitor.type, url: monitor.url }),
      incident,
    })
  } catch (e) { next(e) }
})

module.exports = router
