const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const monitorSvc = require('../services/monitors')
const probeSvc = require('../services/probes')

// GET /api/monitors — list for authenticated user
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const monitors = await monitorSvc.listFor(req.user.id)
    res.json(monitors)
  } catch (e) { next(e) }
})

// POST /api/monitors — create
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const monitor = await monitorSvc.create(req.user.id, req.body)
    res.status(201).json(monitor)
  } catch (e) { next(e) }
})

// PATCH /api/monitors/:id — pause/edit/interval
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const monitor = await monitorSvc.update(req.params.id, req.body, req.user.id)
    if (!monitor) return res.status(404).json({ error: 'Monitor not found' })
    res.json(monitor)
  } catch (e) { next(e) }
})

// DELETE /api/monitors/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await monitorSvc.delete(req.params.id, req.user.id)
    if (!result) return res.status(404).json({ error: 'Monitor not found' })
    res.json({ deleted: true })
  } catch (e) { next(e) }
})

// POST /api/monitors/:id/probe — run one probe now
router.post('/:id/probe', requireAuth, async (req, res, next) => {
  try {
    const monitor = await monitorSvc.getById(req.params.id)
    if (!monitor) return res.status(404).json({ error: 'Monitor not found' })
    const probe = await probeSvc.runProbe(monitor)
    res.json(probe)
  } catch (e) { next(e) }
})

module.exports = router