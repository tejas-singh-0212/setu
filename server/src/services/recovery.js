// Recovery service (Part 2) — the approval-gated config-action engine.
// C6 invariant (never bypassed): safety limits → approval → execute → post-check.
// Config actions only: timeout | retry | cache | transform | mapping_rollback.

const { query, pool } = require('../lib/db')
const settingsSvc = require('./settings')

const KINDS = ['timeout', 'retry', 'cache', 'transform', 'mapping_rollback']

class RecoveryError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

async function audit(entityId, action, actor, payload, userId) {
  await query(
    `INSERT INTO auditlog (entity_type, entity_id, action, actor, payload, user_id)
     VALUES ('recovery_action', $1, $2, $3, $4::jsonb, $5)`,
    [entityId, action, actor || 'system', JSON.stringify(payload || {}), userId || null]
  )
}

// Ownership gate: an action/incident is reachable only through the user's own
// monitor. Returns the row or throws a 404 (never reveals other users' rows).
async function ownedAction(id, actor) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new RecoveryError('Recovery action not found', 404)
  const { rows } = await query(
    `SELECT ra.*, m.user_id AS owner_id, i.monitor_id AS incident_monitor_id
     FROM recoveryaction ra
     LEFT JOIN incident i ON i.id = ra.incident_id
     LEFT JOIN monitor m ON m.id = i.monitor_id
     WHERE ra.id = $1`,
    [id]
  )
  if (!rows.length || !actor || rows[0].owner_id !== actor) {
    throw new RecoveryError('Recovery action not found', 404)
  }
  return rows[0]
}

async function addEvent(incidentId, kind, actor, payload) {
  if (!incidentId) return
  await query(
    `INSERT INTO incidentevent (incident_id, kind, actor, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [incidentId, kind, actor || 'system', JSON.stringify(payload || {})]
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEOUT_BOUNDS = [1000, 30000]
const RETRY_BOUNDS = [0, 5]

async function assertUnderHourlyLimit(db, userId) {
  const maxPerHour = Number((await settingsSvc.getSetting('maxRecoveryPerHour', userId)) ?? 3)
  const recent = await db(
    `SELECT COUNT(*)::int AS n FROM recoveryaction ra
     JOIN incident i ON i.id = ra.incident_id
     JOIN monitor m ON m.id = i.monitor_id
     WHERE m.user_id = $1
       AND ra.executed_at >= NOW() - INTERVAL '1 hour'
       AND ra.status IN ('executed', 'verified', 'failed')`,
    [userId]
  )
  if (recent.rows[0].n >= maxPerHour) {
    throw new RecoveryError(`Recovery limit reached (${maxPerHour}/hour) — try again later`, 429)
  }
}

function boundedInt(value, [min, max], name) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new RecoveryError(`${name} must be an integer between ${min} and ${max}`)
  }
  return n
}

// Validates the client payload and pins it to the incident's monitor.
async function sanitizePayload(kind, payload, monitorId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {}
  const body = { ...payload, monitorId }
  if (payload.timeoutMs !== undefined) body.timeoutMs = boundedInt(payload.timeoutMs, TIMEOUT_BOUNDS, 'timeoutMs')
  if (payload.retries !== undefined) body.retries = boundedInt(payload.retries, RETRY_BOUNDS, 'retries')
  if (payload.versionId !== undefined && payload.versionId !== null) {
    if (typeof payload.versionId !== 'string' || !UUID.test(payload.versionId)) {
      throw new RecoveryError('Invalid versionId')
    }
    const v = await query(`SELECT id FROM schemaversion WHERE id = $1 AND monitor_id = $2`, [payload.versionId, monitorId])
    if (!v.rows.length) throw new RecoveryError('Schema version not found', 404)
  }
  return body
}

// ---------- POST /api/recovery — propose (NEVER executes) ----------
async function propose({ incidentId, kind, payload = {}, actor, userId = actor }) {
  if (!KINDS.includes(kind)) {
    throw new RecoveryError(`kind must be one of: ${KINDS.join(', ')}`)
  }
  if (typeof incidentId !== 'string' || !UUID.test(incidentId)) {
    throw new RecoveryError('Incident not found', 404)
  }

  const incident = await query(
    `SELECT i.*, m.user_id AS owner_id
     FROM incident i JOIN monitor m ON m.id = i.monitor_id
     WHERE i.id = $1`,
    [incidentId]
  )
  if (!incident.rows.length || incident.rows[0].owner_id !== userId) {
    throw new RecoveryError('Incident not found', 404)
  }
  const inc = incident.rows[0]

  // Safety limit: max executed recovery actions per hour, per user (429 past the limit).
  // Re-checked at approval time, which is where execution actually happens.
  await assertUnderHourlyLimit(query, userId)

  // The action always targets the incident's own monitor — a client-supplied
  // monitorId is never trusted (it could name another user's monitor).
  const body = await sanitizePayload(kind, payload, inc.monitor_id)

  const inserted = await query(
    `INSERT INTO recoveryaction (incident_id, kind, payload, status, proposed_by)
     VALUES ($1, $2, $3::jsonb, 'pending', $4) RETURNING *`,
    [inc.id, kind, JSON.stringify(body), actor || 'user']
  )
  const action = inserted.rows[0]

  await addEvent(inc.id, 'proposed', actor, { kind, payload: body, actionId: action.id })
  await audit(action.id, 'recovery.propose', actor, { incidentId: inc.id, kind }, userId)

  // Incident moves to diagnosing→recovering only after approval; proposing keeps state
  if (inc.status === 'diagnosing' || inc.status === 'open') {
    // no status change yet — the gate is the approval
  }

  return toDto(action)
}

// ---------- POST /api/recovery/:id/approve — the human gate ----------
async function approve(id, actor) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new RecoveryError('Recovery action not found', 404)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialise approvals per user so the hourly limit cannot be raced.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`recovery-approve:${actor}`])
    const { rows } = await client.query(
      `SELECT ra.*, m.user_id AS owner_id, i.monitor_id AS incident_monitor_id
       FROM recoveryaction ra
       LEFT JOIN incident i ON i.id = ra.incident_id
       LEFT JOIN monitor m ON m.id = i.monitor_id
       WHERE ra.id = $1
       FOR UPDATE OF ra`,
      [id]
    )
    if (!rows.length || rows[0].owner_id !== actor) {
      await client.query('ROLLBACK')
      throw new RecoveryError('Recovery action not found', 404)
    }
    const action = rows[0]
    if (action.status !== 'pending') {
      await client.query('ROLLBACK')
      throw new RecoveryError(`Action is already ${action.status}`, 409)
    }

    // Safety limit is enforced HERE (execution), not just at proposal time —
    // otherwise many pending actions could be proposed and approved in bulk.
    try {
      await assertUnderHourlyLimit((text, params) => client.query(text, params), actor)
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }

    // C6: approval first, execution only through this path
    await client.query(
      `UPDATE recoveryaction SET status = 'approved', approved_by = $2 WHERE id = $1`,
      [id, actor || 'user']
    )

    const payload = action.payload || {}
    // Always the incident's own (ownership-checked) monitor; payload.monitorId is never trusted.
    const monitorId = action.incident_monitor_id || null

    let monitorRow = null
    if (monitorId) {
      const m = await client.query(`SELECT * FROM monitor WHERE id = $1 AND user_id = $2`, [monitorId, actor])
      monitorRow = m.rows[0] || null
    }

    // ----- execute the config action (Setu-controlled config only) -----
    const clamp = (n, [min, max]) => Math.min(max, Math.max(min, Math.round(n)))
    if (action.kind === 'timeout' && monitorRow) {
      const requested = Number(payload.timeoutMs)
      const timeoutMs = Number.isFinite(requested) && requested > 0
        ? clamp(requested, TIMEOUT_BOUNDS)
        : Math.min(15000, (monitorRow.timeout_ms || 5000) + 5000)
      await client.query(`UPDATE monitor SET timeout_ms = $2 WHERE id = $1`, [monitorRow.id, timeoutMs])
    } else if (action.kind === 'retry' && monitorRow) {
      const requested = Number(payload.retries)
      const retries = Number.isFinite(requested) && requested > 0
        ? clamp(requested, RETRY_BOUNDS)
        : Math.max(2, monitorRow.retries || 0)
      await client.query(`UPDATE monitor SET retries = $2 WHERE id = $1`, [monitorRow.id, retries])
    } else if (action.kind === 'cache' && monitorRow) {
      await client.query(`UPDATE monitor SET cache_enabled = true WHERE id = $1`, [monitorRow.id])
    } else if ((action.kind === 'transform' || action.kind === 'mapping_rollback') && monitorRow) {
      // Roll the expected contract: promote newest detected/other version or the named one
      const target = payload.versionId
        ? await client.query(`SELECT * FROM schemaversion WHERE id = $1 AND monitor_id = $2`, [payload.versionId, monitorRow.id])
        : await client.query(
            `SELECT * FROM schemaversion WHERE monitor_id = $1 AND status <> 'expected'
             ORDER BY created_at DESC LIMIT 1`,
            [monitorRow.id]
          )
      const targetRow = target.rows[0]
      if (targetRow) {
        await client.query(
          `UPDATE schemaversion SET status = 'superseded' WHERE monitor_id = $1 AND id <> $2`,
          [monitorRow.id, targetRow.id]
        )
        await client.query(`UPDATE schemaversion SET status = 'expected' WHERE id = $1`, [targetRow.id])
        await client.query(
          `UPDATE mappingfix SET status = 'approved', approved_by = $2, approved_at = NOW()
           WHERE change_id IN (SELECT id FROM changeevent WHERE new_schema_id = $1 OR old_schema_id = $1)
             AND status = 'pending'`,
          [targetRow.id, actor || 'user']
        )
      }
    }

    await client.query(
      `UPDATE recoveryaction SET status = 'executed', executed_at = NOW() WHERE id = $1`,
      [id]
    )
    if (action.incident_id) {
      await client.query(
        `UPDATE incident SET status = 'recovering' WHERE id = $1 AND status NOT IN ('resolved', 'failed')`,
        [action.incident_id]
      )
      await client.query(
        `INSERT INTO incidentevent (incident_id, kind, actor, payload)
         VALUES ($1, 'approved', $2, $3::jsonb)`,
        [action.incident_id, actor || 'user', JSON.stringify({ actionId: id, kind: action.kind })]
      )
      await client.query(
        `INSERT INTO incidentevent (incident_id, kind, actor, payload)
         VALUES ($1, 'executed', $2, $3::jsonb)`,
        [action.incident_id, actor || 'user', JSON.stringify({ actionId: id, kind: action.kind, payload })]
      )
    }
    await client.query(
      `INSERT INTO auditlog (entity_type, entity_id, action, actor, payload, user_id)
       VALUES ('recovery_action', $1, 'recovery.execute', $2, $3::jsonb, $4)`,
      [id, actor || 'user', JSON.stringify({ kind: action.kind, incidentId: action.incident_id, payload }), actor]
    )

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
  return getAction(id)
}

// ---------- POST /api/recovery/:id/reject ----------
async function reject(id, actor) {
  const action = await ownedAction(id, actor)
  if (action.status !== 'pending') throw new RecoveryError(`Action is already ${action.status}`, 409)

  await query(`UPDATE recoveryaction SET status = 'rejected', approved_by = $2 WHERE id = $1`, [id, actor || 'user'])
  await addEvent(action.incident_id, 'rejected', actor, { actionId: id, kind: action.kind })
  await audit(id, 'recovery.reject', actor, { incidentId: action.incident_id }, actor)

  if (action.incident_id) {
    await query(
      `UPDATE incident SET status = 'diagnosing' WHERE id = $1 AND status NOT IN ('resolved', 'failed')`,
      [action.incident_id]
    )
  }
  return getAction(id)
}

// ---------- POST /api/recovery/:id/verify — post-check probe ----------
async function verify(id, actor) {
  const action = await ownedAction(id, actor)
  if (!['executed', 'approved'].includes(action.status)) {
    throw new RecoveryError('Action must be executed before verification', 409)
  }

  const payload = action.payload || {}
  // The incident's own monitor (ownership already checked) — never payload.monitorId.
  const monitorId = action.incident_monitor_id || null
  let postCheckOk = false
  if (monitorId) {
    const monitor = await query(`SELECT * FROM monitor WHERE id = $1 AND user_id = $2`, [monitorId, actor])
    if (monitor.rows[0]) {
      const { runProbe } = require('./probes')
      const probe = await runProbe(monitor.rows[0])
      postCheckOk = Boolean(probe && probe.ok)
    }
  }

  const status = postCheckOk ? 'verified' : 'failed'
  await query(
    `UPDATE recoveryaction SET status = $2, post_check_ok = $3 WHERE id = $1`,
    [id, status, postCheckOk]
  )

  if (action.incident_id) {
    const incidentStatus = postCheckOk ? 'resolved' : 'failed'
    await query(
      `UPDATE incident SET status = $2, closed_at = CASE WHEN $2 IN ('resolved','failed') THEN NOW() ELSE closed_at END
       WHERE id = $1`,
      [action.incident_id, incidentStatus]
    )
    await addEvent(action.incident_id, 'postcheck', actor, { actionId: id, passed: postCheckOk })
  }
  await audit(id, 'recovery.verify', actor, { postCheckOk }, actor)

  // Progressive RAG: every VERIFIED fix joins the knowledge base, so retrieval
  // improves with the team's actual fix history (never blocks the response).
  if (postCheckOk) {
    try {
      const rag = require('./rag')
      let monitorName = 'monitor'
      if (monitorId) {
        const m = await query(`SELECT name FROM monitor WHERE id = $1`, [monitorId])
        monitorName = m.rows[0]?.name || monitorName
      }
      await rag.index(
        'incident_fix',
        action.incident_id,
        `Verified ${action.kind} recovery on ${monitorName} (post-check passed): ${JSON.stringify(payload).slice(0, 300)}`,
        actor // scoped to this user — never retrievable by other accounts
      )
    } catch (e) {
      console.error('RAG index of verified fix failed (non-fatal):', e.message)
    }
  }

  return { ...(await getAction(id)), postCheckOk }
}

// ---------- helpers ----------
function toDto(r) {
  return {
    id: r.id,
    incidentId: r.incident_id,
    kind: r.kind,
    payload: r.payload,
    status: r.status,
    proposedBy: r.proposed_by,
    approvedBy: r.approved_by,
    executedAt: r.executed_at,
    postCheckOk: r.post_check_ok,
  }
}

async function getAction(id) {
  const { rows } = await query(`SELECT * FROM recoveryaction WHERE id = $1`, [id])
  return rows[0] ? toDto(rows[0]) : null
}

async function listForIncident(incidentId) {
  const { rows } = await query(
    `SELECT * FROM recoveryaction WHERE incident_id = $1
     ORDER BY COALESCE(executed_at, 'epoch') DESC`,
    [incidentId]
  )
  return rows.map(toDto)
}

module.exports = { propose, approve, reject, verify, listForIncident, toDto, RecoveryError }
