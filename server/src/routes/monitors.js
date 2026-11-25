const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const monitorSvc = require('../services/monitors')
const probeSvc = require('../services/probes')

// Raw pg row → camelCase DTO (the client contract)
function toDto(r) {
  if (!r) return r
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    type: r.type,
    url: r.url,
    method: r.method,
    intervalSec: r.interval_sec,
    timeoutMs: r.timeout_ms,
    retries: r.retries,
    cacheEnabled: r.cache_enabled,
    status: r.status,
    healthScore: r.health_score,
    lastProbedAt: r.last_probed_at,
    createdAt: r.created_at,
    lastLatencyMs: r.last_latency_ms ?? null,
    latency10mMs: r.latency_10m_ms ?? null,
    openIncidents: r.open_incidents ?? 0,
  }
}

// GET /api/monitors — list for authenticated user
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const monitors = await monitorSvc.listFor(req.session.userId)
    res.json(monitors.map(toDto))
  } catch (e) { next(e) }
})

// POST /api/monitors — create
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const monitor = await monitorSvc.create(req.session.userId, req.body)
    res.status(201).json(toDto(monitor))
  } catch (e) { next(e) }
})

// PATCH /api/monitors/:id — pause/edit/interval
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const monitor = await monitorSvc.update(req.params.id, req.body, req.session.userId)
    if (!monitor) return res.status(404).json({ error: 'Monitor not found' })
    res.json(toDto(monitor))
  } catch (e) { next(e) }
})

// DELETE /api/monitors/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await monitorSvc.delete(req.params.id, req.session.userId)
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
