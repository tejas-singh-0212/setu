// /api/incidents (Part 2) — list/detail with diagnosis, events, drift context.

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const { query } = require('../lib/db')
const diagnosisSvc = require('../services/diagnosis')
const recoverySvc = require('../services/recovery')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toDto(r) {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    monitorName: r.monitor_name,
    type: r.type,
    severity: r.severity,
    title: r.title,
    probableCause: r.probable_cause,
    status: r.status,
    diagnosis: r.diagnosis,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
  }
}

// GET / — filters: type, status, range (7d|30d|all), q (search)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { type, status, range = '7d', q } = req.query
    const conds = [`m.user_id = $1`]
    const params = [req.session.userId]

    if (type && type !== 'all') {
      params.push(type)
      conds.push(`i.type = $${params.length}`)
    }
    if (status && status !== 'all') {
      params.push(status)
      conds.push(`i.status = $${params.length}`)
    }
    if (range !== 'all') {
      const days = range === '30d' ? 30 : range === '24h' ? 1 : 7
      conds.push(`i.opened_at >= NOW() - make_interval(days => ${days})`)
    }
    if (q) {
      params.push(`%${q}%`)
      conds.push(`(i.title ILIKE $${params.length} OR i.probable_cause ILIKE $${params.length} OR m.name ILIKE $${params.length})`)
    }

    const where = `WHERE ${conds.join(' AND ')}`
    const { rows } = await query(
      `SELECT i.*, m.name AS monitor_name,
              (SELECT COUNT(*)::int FROM recoveryaction ra WHERE ra.incident_id = i.id) AS action_count,
              (SELECT status FROM recoveryaction ra WHERE ra.incident_id = i.id
               ORDER BY COALESCE(ra.executed_at, 'epoch') DESC LIMIT 1) AS last_action_status
       FROM incident i
       JOIN monitor m ON m.id = i.monitor_id
       ${where}
       ORDER BY i.opened_at DESC
       LIMIT 200`,
      params
    )
    res.json(rows.map((r) => ({ ...toDto(r), actionCount: r.action_count, lastActionStatus: r.last_action_status })))
  } catch (e) { next(e) }
})

// GET /:id — incident + monitor + events + (drift context) + actions + diagnosis-on-demand
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Incident not found' })

    const incRes = await query(
      `SELECT i.*, m.name AS monitor_name, m.url AS monitor_url, m.type AS monitor_type
       FROM incident i JOIN monitor m ON m.id = i.monitor_id
       WHERE i.id = $1 AND m.user_id = $2`,
      [req.params.id, req.session.userId]
    )
    if (!incRes.rows.length) return res.status(404).json({ error: 'Incident not found' })
    const incident = incRes.rows[0]

    // Rules + RAG + LLM diagnosis when missing (never fails the request)
    if (!incident.diagnosis || !incident.diagnosis.summary) {
      try {
        await diagnosisSvc.diagnose(incident)
        const refreshed = await query(`SELECT * FROM incident WHERE id = $1`, [incident.id])
        incident.diagnosis = refreshed.rows[0].diagnosis
        incident.status = refreshed.rows[0].status
      } catch (e) {
        console.error('Diagnosis failed:', e.message)
      }
    }

    const [events, actions] = await Promise.all([
      query(`SELECT * FROM incidentevent WHERE incident_id = $1 ORDER BY at ASC`, [incident.id]),
      recoverySvc.listForIncident(incident.id),
    ])

    // Drift context: change event + both schema versions + mapping fixes
    let drift = null
    if (incident.type === 'drift') {
      const change = await query(
        `SELECT * FROM changeevent WHERE monitor_id = $1 ORDER BY detected_at DESC LIMIT 1`,
        [incident.monitor_id]
      )
      if (change.rows.length) {
        const ce = change.rows[0]
        const [oldV, newV, fixes] = await Promise.all([
          query(`SELECT * FROM schemaversion WHERE id = $1`, [ce.old_schema_id]),
          query(`SELECT * FROM schemaversion WHERE id = $1`, [ce.new_schema_id]),
          query(`SELECT * FROM mappingfix WHERE change_id = $1`, [ce.id]),
        ])
        drift = {
          change: {
            id: ce.id,
            changeType: ce.change_type,
            detectedAt: ce.detected_at,
            status: ce.status,
          },
          expected: oldV.rows[0] || null,
          detected: newV.rows[0] || null,
          mappingFixes: fixes.rows,
        }
      }
    }

    res.json({
      incident: toDto(incident),
      monitor: {
        id: incident.monitor_id,
        name: incident.monitor_name,
        url: incident.monitor_url,
        type: incident.monitor_type,
      },
      events: events.rows.map((e) => ({
        id: e.id,
        at: e.at,
        kind: e.kind,
        actor: e.actor,
        payload: e.payload,
      })),
      actions,
      drift,
    })
  } catch (e) { next(e) }
})

module.exports = router
