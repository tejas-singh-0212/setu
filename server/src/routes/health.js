const router = require('express').Router()
const { query } = require('../lib/db')
const { requireAuth } = require('../middleware/auth')

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [totalMonitors, apiMonitors, websiteMonitors, openIncidents, recentProbes, avgHealthScore, avgResponseTime, dependencyWarningCount] = await Promise.all([
      query('SELECT COUNT(*) as count FROM monitor'),
      query("SELECT COUNT(*) as count FROM monitor WHERE type = 'api'"),
      query("SELECT COUNT(*) as count FROM monitor WHERE type = 'website'"),
      query("SELECT COUNT(*) as count FROM incident WHERE status = 'open'"),
      `SELECT * FROM probe WHERE at >= NOW() - INTERVAL '24 hours'`,
      // Average health score
      query(`SELECT AVG(health_score) as avg FROM monitor WHERE last_probed_at IS NOT NULL`),
      // Average response time
      `SELECT AVG(latency_ms) as avg FROM probe WHERE at >= NOW() - INTERVAL '24 hours'`,
      // Dependency warning count
      query("SELECT COUNT(*) as count FROM dependencycheck WHERE ssl_days_left <= 14"),
    ])

    res.json({
      monitorCount: { total: parseInt(totalMonitors.rows[0].count), api: parseInt(apiMonitors.rows[0].count), website: parseInt(websiteMonitors.rows[0].count) },
      openIncidents: parseInt(openIncidents.rows[0].count),
      avgHealthScore: Math.round(parseFloat(avgHealthScore.rows[0].avg) || 0),
      avgResponseTime: Math.round(parseFloat(avgResponseTime.rows[0].avg) || 0),
      dependencyWarningCount: parseInt(dependencyWarningCount.rows[0].count),
      recentIncidents: [], // Would need to fetch with monitor names
    })
  } catch (e) { next(e) }
})

module.exports = router