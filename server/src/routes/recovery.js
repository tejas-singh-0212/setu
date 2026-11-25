// /api/recovery (Part 2) — propose → approve (human gate) → verify (post-check).
// C6: POST / never executes; only POST /:id/approve runs the action.

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const recoverySvc = require('../services/recovery')

const actorOf = (req) => req.session?.userId || 'user'

function send(res, next, fn) {
  Promise.resolve(fn())
    .then((result) => res.json(result))
    .catch((e) => {
      if (e instanceof recoverySvc.RecoveryError || e.status) return res.status(e.status || 400).json({ error: e.message })
      next(e)
    })
}

// POST / — propose {incidentId, kind, payload} → pending action (nothing executes)
router.post('/', requireAuth, (req, res, next) => {
  send(res, next, () => recoverySvc.propose({ ...req.body, actor: actorOf(req) }))
})

// POST /:id/approve — the gate: approve + execute the config action
router.post('/:id/approve', requireAuth, (req, res, next) => {
  send(res, next, () => recoverySvc.approve(req.params.id, actorOf(req)))
})

// POST /:id/reject
router.post('/:id/reject', requireAuth, (req, res, next) => {
  send(res, next, () => recoverySvc.reject(req.params.id, actorOf(req)))
})

// POST /:id/verify — post-check probe → verified|failed, incident resolved|failed
router.post('/:id/verify', requireAuth, (req, res, next) => {
  send(res, next, () => recoverySvc.verify(req.params.id, actorOf(req)))
})

module.exports = router
