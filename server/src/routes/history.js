// /api/history (Part 3, C4) — schema versions + audit trail, and schema rollback.

const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const { query, pool } = require('../lib/db')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET / — { versions, audit }
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId
    const [versions, audit] = await Promise.all([
      query(
        `SELECT sv.id, sv.monitor_id, m.name AS monitor_name, sv.version, sv.schema_json, sv.status, sv.created_at,
                COALESCE(ce.changes, 0)::int AS change_count, ce.change_types, ce.last_detected_at
         FROM schemaversion sv
         JOIN monitor m ON m.id = sv.monitor_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS changes, array_agg(DISTINCT change_type::text) AS change_types,
                  MAX(detected_at) AS last_detected_at
           FROM changeevent WHERE new_schema_id = sv.id
         ) ce ON true
         WHERE m.user_id = $1
         ORDER BY m.name, sv.created_at, sv.version`,
        [userId]
      ),
      query(
        `SELECT a.id, a.entity_type, a.entity_id, a.action, a.actor, a.timestamp, a.payload,
                COALESCE(u.name, a.actor) AS actor_name
         FROM auditlog a
         LEFT JOIN "User" u ON u.id::text = a.actor
         WHERE a.user_id = $1
         ORDER BY a.timestamp DESC LIMIT 50`,
        [userId]
      ),
    ])
    res.json({
      versions: versions.rows.map((r) => ({
        id: r.id,
        monitorId: r.monitor_id,
        monitorName: r.monitor_name,
        version: r.version,
        schema: r.schema_json,
        status: r.status,
        createdAt: r.created_at,
        changeCount: r.change_count,
        changeTypes: r.change_types || [],
        lastDetectedAt: r.last_detected_at,
      })),
      audit: audit.rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        actor: r.actor,
        actorName: r.actor_name,
        timestamp: r.timestamp,
        payload: r.payload,
      })),
    })
  } catch (e) { next(e) }
})

// POST /rollback/:versionId — target becomes 'expected', its siblings 'superseded', + audit row.
// The human confirmation happens client-side (rollback confirm overlay) before this is called.
router.post('/rollback/:versionId', requireAuth, async (req, res, next) => {
  if (!UUID.test(req.params.versionId)) return res.status(404).json({ error: 'Schema version not found' })
  const actor = req.session?.userId || req.user?.id || 'system'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const target = await client.query(
      `SELECT sv.* FROM schemaversion sv
       JOIN monitor m ON m.id = sv.monitor_id
       WHERE sv.id = $1 AND m.user_id = $2
       FOR UPDATE OF sv`,
      [req.params.versionId, req.session.userId]
    )
    if (!target.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Schema version not found' })
    }
    const version = target.rows[0]
    const previous = await client.query(
      `SELECT id, version FROM schemaversion WHERE monitor_id = $1 AND status = 'expected' AND id <> $2`,
      [version.monitor_id, version.id]
    )
    await client.query(
      `UPDATE schemaversion SET status = 'superseded' WHERE monitor_id = $1 AND id <> $2`,
      [version.monitor_id, version.id]
    )
    const updated = await client.query(
      `UPDATE schemaversion SET status = 'expected' WHERE id = $1 RETURNING *`,
      [version.id]
    )
    await client.query(
      `INSERT INTO auditlog (entity_type, entity_id, action, actor, payload, user_id)
       VALUES ('schema_version', $1, 'schema.rollback', $2, $3::jsonb, $4)`,
      [
        version.id,
        actor,
        JSON.stringify({
          monitorId: version.monitor_id,
          version: version.version,
          previous: previous.rows.map((r) => ({ id: r.id, version: r.version })),
        }),
        req.session.userId,
      ]
    )
    await client.query('COMMIT')
    res.json(updated.rows[0])
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    next(e)
  } finally {
    client.release()
  }
})

module.exports = router
