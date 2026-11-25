// /api/llm (Part 2, C4) — GET /status for the Settings page + RAG badges.
// No secrets ever leave this endpoint.

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const llm = require('../services/llm')
const rag = require('../services/rag')

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const configured = llm.isConfigured()
    const ragRow = await require('../lib/db').query(`SELECT value FROM setting WHERE key = 'ragEnabled'`)
    const ragEnabled = ragRow.rows.length ? ragRow.rows[0].value !== false : true
    const ragCount = await rag.count()

    res.json({
      configured,
      model: llm.modelLabel(),
      provider: configured ? 'Llama via free inference API' : null,
      endpoint: configured ? String(process.env.LLM_API_URL).replace(/\/$/, '') : null,
      modelId: process.env.LLM_MODEL || null,
      healthy: configured, // real probe deferred — configured endpoint assumed reachable
      ragEnabled,
      ragCount,
      embeddings: ragCount,
    })
  } catch (e) { next(e) }
})

module.exports = router
