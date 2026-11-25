// GET /api/reports?range=7d|30d|90d (Part 3) — stats, recovery effectiveness, incident history.

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const reports = require('../services/reports')

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const range = req.query.range || '7d'
    if (!(range in reports.RANGE_DAYS)) {
      return res.status(400).json({ error: `range must be one of ${Object.keys(reports.RANGE_DAYS).join(', ')}` })
    }
    res.json(await reports.build(range, req.session.userId))
  } catch (e) { next(e) }
})

module.exports = router
