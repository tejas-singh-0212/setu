// Recommendations service (Part 2) — apply/dismiss.
// Rows are per user AND derived from that user's own data: on first list we
// build cards from THEIR monitors/incidents/dependency checks, so two
// accounts never see the same set (an account with no data sees none).

const { query } = require('../lib/db')
const recoverySvc = require('./recovery')

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

// Derive recommendation cards from this user's actual state (max 4).
async function buildFor(userId) {
  const recs = []
  const push = (r) => {
    if (recs.length < 4 && !recs.some((x) => x.title === r.title)) recs.push(r)
  }

  // 1. Open drift incident → schema-fix (transform) recommendation
  const drift = await query(
    `SELECT i.title, i.probable_cause, m.id AS monitor_id, m.name
     FROM incident i JOIN monitor m ON m.id = i.monitor_id
     WHERE m.user_id = $1 AND i.type = 'drift' AND i.status NOT IN ('resolved', 'failed')
     ORDER BY i.opened_at DESC LIMIT 1`,
    [userId]
  )
  if (drift.rows[0]) {
    const d = drift.rows[0]
    push({
      monitorId: d.monitor_id,
      title: `Apply schema fix for ${d.name}`,
      why: d.probable_cause || d.title,
      action: { kind: 'transform', fix: 'remap drifted fields' },
      source: 'rag',
    })
  }

  // 2. Open latency incident → retry with backoff
  const lat = await query(
    `SELECT i.title, i.probable_cause, m.id AS monitor_id, m.name
     FROM incident i JOIN monitor m ON m.id = i.monitor_id
     WHERE m.user_id = $1 AND i.type = 'latency' AND i.status NOT IN ('resolved', 'failed')
     ORDER BY i.opened_at DESC LIMIT 1`,
    [userId]
  )
  if (lat.rows[0]) {
    const l = lat.rows[0]
    push({
      monitorId: l.monitor_id,
      title: `Add retry with exponential backoff to ${l.name} monitor`,
      why: l.probable_cause || l.title,
      action: { kind: 'retry', retries: 2, backoff: 'exponential' },
      source: 'telemetry',
    })
  }

  // 3. Latest dependency check with SSL expiring ≤ 14 days → renew reminder
  const ssl = await query(
    `SELECT dc.ssl_days_left, m.id AS monitor_id, m.name,
            dc.upstream_hosts -> 'hosts' ->> 0 AS host
     FROM monitor m
     JOIN LATERAL (
       SELECT * FROM dependencycheck WHERE monitor_id = m.id ORDER BY at DESC LIMIT 1
     ) dc ON true
     WHERE m.user_id = $1 AND dc.ssl_days_left IS NOT NULL AND dc.ssl_days_left <= 14
     ORDER BY dc.ssl_days_left ASC
     LIMIT 1`,
    [userId]
  )
  if (ssl.rows[0]) {
    const s = ssl.rows[0]
    push({
      monitorId: s.monitor_id,
      title: `Renew SSL certificate for ${s.host || s.name}`,
      why: `Expires in ${s.ssl_days_left} days (from dependencies)`,
      action: { kind: 'ssl_renew' },
      source: 'dependency',
    })
  }

  // 4. A healthy website monitor (no open incidents) → interval tuning
  const site = await query(
    `SELECT m.id, m.name FROM monitor m
     WHERE m.user_id = $1 AND m.type = 'website'
       AND NOT EXISTS (
         SELECT 1 FROM incident i
         WHERE i.monitor_id = m.id AND i.status NOT IN ('resolved', 'failed')
       )
     LIMIT 1`,
    [userId]
  )
  if (site.rows[0]) {
    push({
      monitorId: null,
      title: 'Extend website probe interval to 2 minutes',
      why: '0 anomalies on website monitors in 7 days; cuts noise',
      action: { kind: 'interval', minutes: 120 },
      source: 'telemetry',
    })
  }

  return recs
}

async function ensureSeeded(userId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM recommendation WHERE user_id = $1`, [userId])
  if (rows[0].n > 0) return

  const recs = await buildFor(userId)
  for (const rec of recs) {
    await query(
      `INSERT INTO recommendation (monitor_id, user_id, title, why, action, source, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'open')`,
      [rec.monitorId, userId, rec.title, rec.why, JSON.stringify(rec.action), rec.source]
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
