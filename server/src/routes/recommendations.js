// /api/recommendations (Part 2) — cards, apply (→ approval flow), dismiss.

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const recSvc = require('../services/recommendations')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function send(res, next, fn) {
  Promise.resolve(fn())
    .then((result) => res.json(result))
    .catch((e) => res.status(e.status || 500).json({ error: e.message }))
}

// GET /
router.get('/', requireAuth, (req, res, next) => {
  send(res, next, () => recSvc.list())
})

// POST / — create (used by dependency reminders / future LLM runs)
router.post('/', requireAuth, (req, res, next) => {
  const { monitorId = null, title, why, action = {}, source = 'telemetry' } = req.body || {}
  if (!title || !why) return res.status(400).json({ error: 'title and why are required' })
  if (monitorId && !UUID.test(monitorId)) return res.status(400).json({ error: 'Invalid monitorId' })
  send(res, next, () => recSvc.create({ monitorId, title, why, action, source }, req.session?.userId))
})

// POST /:id/apply — marks applied + returns a pending RecoveryAction (approval gate)
router.post('/:id/apply', requireAuth, (req, res, next) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Recommendation not found' })
  send(res, next, () => recSvc.apply(req.params.id, req.session?.userId))
})

// POST /:id/dismiss
router.post('/:id/dismiss', requireAuth, (req, res, next) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Recommendation not found' })
  send(res, next, () => recSvc.dismiss(req.params.id))
})

module.exports = router
