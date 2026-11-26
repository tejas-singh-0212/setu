// Diagnosis service (Part 2) — rules first, RAG context, LLM narrative.
// diagnose(incident) stores Incident.diagnosis {summary, confidence, ragUsed, rules}
// and an IncidentEvent(diagnosis). LLM failure → rules-only, never a 5xx.

const { query } = require('../lib/db')
const llm = require('./llm')
const rag = require('./rag')

const RULES = {
  drift: {
    summary: 'Upstream API schema change — the response contract no longer matches the expected schema.',
    confidence: 0.92,
  },
  latency: {
    summary: 'Third-party slowness or payload growth — repeated calls exceeded the latency threshold.',
    confidence: 0.85,
  },
  error: {
    summary: 'Upstream 5xx burst — the target returned server errors in a short window.',
    confidence: 0.88,
  },
  dependency: {
    summary: 'Dependency health issue — certificate expiry or DNS/upstream failure.',
    confidence: 0.9,
  },
}

async function diagnose(incident) {
  // Already diagnosed?
  if (incident.diagnosis && incident.diagnosis.summary) return incident.diagnosis

  const rule = RULES[incident.type] || RULES.error
  const rules = {
    type: incident.type,
    probableCause: incident.probable_cause,
    rule: rule.summary,
  }

  // Move to diagnosing while we work (keep resolved/failed as-is)
  if (incident.status === 'open') {
    await query(`UPDATE incident SET status = 'diagnosing' WHERE id = $1 AND status = 'open'`, [incident.id])
  }

  // RAG: similar past incidents + knowledge
  let ragHits = []
  let ragUsed = 0
  try {
    const owner = await query(`SELECT user_id FROM monitor WHERE id = $1`, [incident.monitor_id])
    const ownerId = owner.rows[0]?.user_id || null
    const enabled = await query(
      `SELECT value FROM setting WHERE key = 'ragEnabled' AND user_id = $1`,
      [ownerId]
    )
    const on = enabled.rows.length ? enabled.rows[0].value !== false : true
    if (on && ownerId) {
      ragHits = await rag.retrieve(`${incident.title} ${incident.probable_cause || ''}`.trim(), 4, ownerId)
      ragUsed = ragHits.length
    }
  } catch (e) {
    console.error('RAG retrieval failed during diagnosis (continuing rules-only):', e.message)
    ragUsed = 0
  }

  let summary = rule.summary
  let confidence = rule.confidence
  let llmUsed = false

  // LLM narrative (augment only — rules always produce a usable diagnosis)
  if (llm.isConfigured()) {
    try {
      const context = ragHits.map((h) => `- ${h.content}`).join('\n') || '- (no similar incidents)'
      const text = await llm.chat(
        'You are an SRE assistant. Answer with exactly two sentences: a probable root cause and one next action. No preamble.',
        `Incident: ${incident.title}\nType: ${incident.type}\nSignals: ${incident.probable_cause || 'n/a'}\nSimilar past incidents (RAG):\n${context}`
      )
      if (text) {
        summary = text.trim()
        confidence = Math.min(0.97, rule.confidence + (ragUsed ? 0.03 : 0))
        llmUsed = true
      }
    } catch {
      // LlmUnavailable → rules-only, no error
    }
  }

  const diagnosis = {
    summary,
    confidence: Math.round(confidence * 100) / 100,
    ragUsed,
    llm: llmUsed,
    rules,
    similarIncidents: ragHits.slice(0, 3).map((h) => ({ content: h.content, score: Number(h.score) || 0 })),
  }

  await query(`UPDATE incident SET diagnosis = $2::jsonb WHERE id = $1`, [incident.id, JSON.stringify(diagnosis)])
  await query(
    `INSERT INTO incidentevent (incident_id, kind, actor, payload)
     VALUES ($1, 'diagnosis', $2, $3::jsonb)`,
    [incident.id, llmUsed ? 'llm' : 'rules', JSON.stringify({ confidence: diagnosis.confidence, ragUsed, llm: llmUsed })]
  )

  return diagnosis
}

module.exports = { diagnose }
