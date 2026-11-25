// Recommendations service (Part 2) — canonical recommendation cards + apply/dismiss.
// Rows are per user: seeded per account on first list, never shared between accounts.

const { query } = require('../lib/db')
const recoverySvc = require('./recovery')

const CANONICAL = [
  {
    title: 'Add retry with exponential backoff to JSONPlaceholder monitor',
    why: '12 slow calls this week; 3 recovered by retry in similar past incidents (RAG ×5)',
    action: { kind: 'retry', retries: 2, backoff: 'exponential' },
    source: 'telemetry',
    monitorName: 'JSONPlaceholder',
  },
  {
    title: 'Bake capital_city remap into the transform permanently',
    why: '2nd drift this month on the same field',
    action: { kind: 'transform', fix: 'capital→capital_city' },
    source: 'rag',
    monitorName: null,
  },
  {
    title: 'Extend website probe interval to 2 minutes',
    why: '0 anomalies on website monitors in 7 days; cuts noise',
    action: { kind: 'interval', minutes: 120 },
    source: 'telemetry',
    monitorName: null,
  },
  {
    title: 'Renew SSL certificate for restcountries.com',
    why: 'Expires in 12 days (from dependencies)',
    action: { kind: 'ssl_renew' },
    source: 'dependency',
    monitorName: 'REST Countries API',
  },
]

function toDto(r, monitorName) {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    monitorName: monitorName || null,
    title: r.title,
    why: r.why,
    action: r.action,
    source: r.source,
    status: r.status,
    createdAt: r.created_at,
    llmBadge: true,
  }
}

async function ensureSeeded(userId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM recommendation WHERE user_id = $1`, [userId])
  if (rows[0].n > 0) return

  for (const rec of CANONICAL) {
    let monitorId = null
    if (rec.monitorName) {
      const m = await query(`SELECT id FROM monitor WHERE name = $1 AND user_id = $2 LIMIT 1`, [rec.monitorName, userId])
      monitorId = m.rows[0]?.id || null
    }
    await query(
      `INSERT INTO recommendation (monitor_id, user_id, title, why, action, source, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'open')`,
      [monitorId, userId, rec.title, rec.why, JSON.stringify(rec.action), rec.source]
    )
  }
}

async function list(userId) {
  await ensureSeeded(userId)
  const { rows } = await query(
    `SELECT r.*, m.name AS monitor_name
     FROM recommendation r
     LEFT JOIN monitor m ON m.id = r.monitor_id
     WHERE r.user_id = $1
     ORDER BY (r.status = 'open') DESC, r.created_at DESC`,
    [userId]
  )
  return rows.map((r) => toDto(r, r.monitor_name))
}

// apply → status open→applied, returns a PENDING RecoveryAction for the approval flow
async function apply(id, userId) {
  const { rows } = await query(`SELECT * FROM recommendation WHERE id = $1 AND user_id = $2`, [id, userId])
  if (!rows.length) {
    const e = new Error('Recommendation not found')
    e.status = 404
    throw e
  }
  const rec = rows[0]
  if (rec.status !== 'open') {
    const e = new Error(`Recommendation is already ${rec.status}`)
    e.status = 409
    throw e
  }

  const action = rec.action || {}
  // Actions the recovery engine can execute → go through the approval gate.
  const executable = ['timeout', 'retry', 'cache', 'transform', 'mapping_rollback'].includes(action.kind)

  let pendingAction = null
  if (executable && rec.monitor_id) {
    // Attach to this monitor's open incident when there is one, else propose
    // against a synthetic path: recovery.propose requires an incident, so use
    // an open incident of any type for the monitor, creating none.
    const inc = await query(
      `SELECT id FROM incident WHERE monitor_id = $1 AND status NOT IN ('resolved', 'failed')
       ORDER BY opened_at DESC LIMIT 1`,
      [rec.monitor_id]
    )
    if (inc.rows[0]) {
      pendingAction = await recoverySvc.propose({
        incidentId: inc.rows[0].id,
        kind: action.kind,
        payload: { ...action, monitorId: rec.monitor_id, recommendationId: rec.id },
        actor: userId,
        userId,
      })
    }
  }

  await query(`UPDATE recommendation SET status = 'applied' WHERE id = $1 AND user_id = $2`, [id, userId])
  return { recommendation: toDto({ ...rec, status: 'applied' }), action: pendingAction }
}

async function dismiss(id, userId) {
  const { rows } = await query(`SELECT * FROM recommendation WHERE id = $1 AND user_id = $2`, [id, userId])
  if (!rows.length) {
    const e = new Error('Recommendation not found')
    e.status = 404
    throw e
  }
  await query(`UPDATE recommendation SET status = 'dismissed' WHERE id = $1 AND user_id = $2`, [id, userId])
  return toDto({ ...rows[0], status: 'dismissed' })
}

// Create (used by dependencies /remind and future LLM runs)
async function create({ monitorId = null, title, why, action = {}, source = 'telemetry' }, userId) {
  if (monitorId) {
    const m = await query(`SELECT id FROM monitor WHERE id = $1 AND user_id = $2`, [monitorId, userId])
    if (!m.rows.length) {
      const e = new Error('Monitor not found')
      e.status = 404
      throw e
    }
  }
  const { rows } = await query(
    `INSERT INTO recommendation (monitor_id, user_id, title, why, action, source, status)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'open') RETURNING *`,
    [monitorId, userId, title, why, JSON.stringify(action), source]
  )
  return toDto(rows[0])
}

module.exports = { list, apply, dismiss, create, ensureSeeded }
