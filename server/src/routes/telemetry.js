// GET /api/telemetry?range=1h|6h|24h|7d[&monitor=<id>] (Part 3, C4)

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const telemetry = require('../services/telemetry')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const range = req.query.range || '24h'
    if (!(range in telemetry.RANGES)) {
      return res.status(400).json({ error: `range must be one of ${Object.keys(telemetry.RANGES).join(', ')}` })
    }
    const monitorId = req.query.monitor || null
    if (monitorId && !UUID.test(monitorId)) return res.status(400).json({ error: 'Invalid monitor id' })
    res.json(await telemetry.load({ range, monitorId }))
  } catch (e) { next(e) }
})

module.exports = router
