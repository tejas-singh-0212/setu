// /api/settings (Part 3) — thresholds & safety. LLM status comes from GET /api/llm/status (Part 2).

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const settings = require('../services/settings')

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({
      settings: await settings.getAll(req.session.userId),
      writable: Object.keys(settings.WRITABLE),
      locked: settings.LOCKED,
    })
  } catch (e) { next(e) }
})

// PUT / — whitelisted keys only; requireApproval / dryRunDefault are locked ON.
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { errors } = settings.validate(req.body)
    if (errors.length) return res.status(400).json({ error: errors.join('; '), errors })
    const actor = req.session?.userId || req.user?.id || 'system'
    res.json(await settings.update(req.body, actor, req.session.userId))
  } catch (e) { next(e) }
})

module.exports = router
