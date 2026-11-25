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

async function audit(entityId, action, actor, payload) {
  await query(
    `INSERT INTO auditlog (entity_type, entity_id, action, actor, payload)
     VALUES ('recovery_action', $1, $2, $3, $4::jsonb)`,
    [entityId, action, actor || 'system', JSON.stringify(payload || {})]
  )
}

async function addEvent(incidentId, kind, actor, payload) {
  if (!incidentId) return
  await query(
    `INSERT INTO incidentevent (incident_id, kind, actor, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [incidentId, kind, actor || 'system', JSON.stringify(payload || {})]
  )
}

// ---------- POST /api/recovery — propose (NEVER executes) ----------
async function propose({ incidentId, kind, payload = {}, actor }) {
  if (!KINDS.includes(kind)) {
    throw new RecoveryError(`kind must be one of: ${KINDS.join(', ')}`)
  }

  const incident = await query(`SELECT * FROM incident WHERE id = $1`, [incidentId])
  if (!incident.rows.length) throw new RecoveryError('Incident not found', 404)
  const inc = incident.rows[0]

  // Safety limit: max executed recovery actions per hour (429 past the limit)
  const maxPerHour = Number((await settingsSvc.getSetting('maxRecoveryPerHour')) ?? 3)
  const recent = await query(
    `SELECT COUNT(*)::int AS n FROM recoveryaction
     WHERE executed_at >= NOW() - INTERVAL '1 hour' AND status IN ('executed', 'verified')`
  )
  if (recent.rows[0].n >= maxPerHour) {
    throw new RecoveryError(`Recovery limit reached (${maxPerHour}/hour) — try again later`, 429)
  }

  // Attach the monitor so execution can find it
  const body = { ...payload, monitorId: payload.monitorId || inc.monitor_id }

  const inserted = await query(
    `INSERT INTO recoveryaction (incident_id, kind, payload, status, proposed_by)
     VALUES ($1, $2, $3::jsonb, 'pending', $4) RETURNING *`,
    [inc.id, kind, JSON.stringify(body), actor || 'user']
  )
  const action = inserted.rows[0]

  await addEvent(inc.id, 'proposed', actor, { kind, payload: body, actionId: action.id })
  await audit(action.id, 'recovery.propose', actor, { incidentId: inc.id, kind })

  // Incident moves to diagnosing→recovering only after approval; proposing keeps state
  if (inc.status === 'diagnosing' || inc.status === 'open') {
    // no status change yet — the gate is the approval
  }

  return toDto(action)
}

// ---------- POST /api/recovery/:id/approve — the human gate ----------
async function approve(id, actor) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT * FROM recoveryaction WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      throw new RecoveryError('Recovery action not found', 404)
    }
    const action = rows[0]
    if (action.status !== 'pending') {
      await client.query('ROLLBACK')
      throw new RecoveryError(`Action is already ${action.status}`, 409)
    }

    // C6: approval first, execution only through this path
    await client.query(
      `UPDATE recoveryaction SET status = 'approved', approved_by = $2 WHERE id = $1`,
      [id, actor || 'user']
    )

    const payload = action.payload || {}
    const monitorId = payload.monitorId || (action.incident_id
      ? (await client.query(`SELECT monitor_id FROM incident WHERE id = $1`, [action.incident_id])).rows[0]?.monitor_id
      : null)

    let monitorRow = null
    if (monitorId) {
      const m = await client.query(`SELECT * FROM monitor WHERE id = $1`, [monitorId])
      monitorRow = m.rows[0] || null
    }

    // ----- execute the config action (Setu-controlled config only) -----
    if (action.kind === 'timeout' && monitorRow) {
      const timeoutMs = Number(payload.timeoutMs) || Math.min(15000, (monitorRow.timeout_ms || 5000) + 5000)
      await client.query(`UPDATE monitor SET timeout_ms = $2 WHERE id = $1`, [monitorRow.id, timeoutMs])
    } else if (action.kind === 'retry' && monitorRow) {
      const retries = Number(payload.retries) || Math.max(2, monitorRow.retries || 0)
      await client.query(`UPDATE monitor SET retries = $2 WHERE id = $1`, [monitorRow.id, retries])
    } else if (action.kind === 'cache' && monitorRow) {
      await client.query(`UPDATE monitor SET cache_enabled = true WHERE id = $1`, [monitorRow.id])
    } else if ((action.kind === 'transform' || action.kind === 'mapping_rollback') && monitorRow) {
      // Roll the expected contract: promote newest detected/other version or the named one
      const target = payload.versionId
        ? await client.query(`SELECT * FROM schemaversion WHERE id = $1`, [payload.versionId])
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
      `INSERT INTO auditlog (entity_type, entity_id, action, actor, payload)
       VALUES ('recovery_action', $1, 'recovery.execute', $2, $3::jsonb)`,
      [id, actor || 'user', JSON.stringify({ kind: action.kind, incidentId: action.incident_id, payload })]
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
  const { rows } = await query(`SELECT * FROM recoveryaction WHERE id = $1`, [id])
  if (!rows.length) throw new RecoveryError('Recovery action not found', 404)
  const action = rows[0]
  if (action.status !== 'pending') throw new RecoveryError(`Action is already ${action.status}`, 409)

  await query(`UPDATE recoveryaction SET status = 'rejected', approved_by = $2 WHERE id = $1`, [id, actor || 'user'])
  await addEvent(action.incident_id, 'rejected', actor, { actionId: id, kind: action.kind })
  await audit(id, 'recovery.reject', actor, { incidentId: action.incident_id })

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
  const { rows } = await query(`SELECT * FROM recoveryaction WHERE id = $1`, [id])
  if (!rows.length) throw new RecoveryError('Recovery action not found', 404)
  const action = rows[0]
  if (!['executed', 'approved'].includes(action.status)) {
    throw new RecoveryError('Action must be executed before verification', 409)
  }

  const payload = action.payload || {}
  let monitorId = payload.monitorId
  if (!monitorId && action.incident_id) {
    const inc = await query(`SELECT monitor_id FROM incident WHERE id = $1`, [action.incident_id])
    monitorId = inc.rows[0]?.monitor_id
  }
  let postCheckOk = false
  if (monitorId) {
    const monitor = await query(`SELECT * FROM monitor WHERE id = $1`, [monitorId])
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
  await audit(id, 'recovery.verify', actor, { postCheckOk })

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
        `Verified ${action.kind} recovery on ${monitorName} (post-check passed): ${JSON.stringify(payload).slice(0, 300)}`
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
