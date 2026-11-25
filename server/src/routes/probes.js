// Probes routes — probe history for charts

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const probeSvc = require('../services/probes')

// GET /api/probes?monitor=&range=
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const monitorId = req.query.monitor
    const range = req.query.range || '24h'
    const history = await probeSvc.getHistory(monitorId, range, req.session.userId)
    res.json(history)
  } catch (e) { next(e) }
})

module.exports = router
