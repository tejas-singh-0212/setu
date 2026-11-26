// afterProbe hook — schema drift detection for API monitors (C2, Part 2).
// Idempotent: while a drift incident is open for the monitor no second one
// is created. Marks the probe schema_ok=false when a change is found.

const { query } = require('../../lib/db')
const { inferSchema, normalizeExpected, diffSchemas, summarize } = require('../../services/schemaDiff')

module.exports = {
  name: 'schema-diff',
  run: async (ctx) => {
    const { monitor, probe, payload } = ctx
    if (!monitor || monitor.type !== 'api') return
    if (!payload) return // non-JSON / failed probe — nothing to diff

    const detected = inferSchema(payload)
    if (!detected || !Object.keys(detected.fields).length) return

    const expectedRow = await query(
      `SELECT * FROM schemaversion WHERE monitor_id = $1 AND status = 'expected'
       ORDER BY created_at DESC LIMIT 1`,
      [monitor.id]
    )

    // First sight of this API: establish the baseline instead of alarming.
    if (!expectedRow.rows.length) {
      await query(
        `INSERT INTO schemaversion (monitor_id, version, schema_json, status)
         VALUES ($1, 'v1.0', $2::jsonb, 'expected')`,
        [monitor.id, JSON.stringify(detected)]
      )
      return
    }

    const expected = normalizeExpected(expectedRow.rows[0].schema_json)
    const changes = diffSchemas(expected, detected)
    // A purely additive change (new fields only) is backward-compatible: not
    // drift. It also has no change_type enum value, so it must never reach the
    // changeevent insert below.
    const breaking = changes.filter((c) => c.changeType !== 'added')
    if (!breaking.length) return

    // Mark this probe as a schema failure
    await query(`UPDATE probe SET schema_ok = false WHERE id = $1`, [probe.id])

    // Record the detected version (one per unique field set, to stay idempotent)
    const detectedJson = JSON.stringify(detected)
    let detectedRow = await query(
      `SELECT * FROM schemaversion WHERE monitor_id = $1 AND schema_json = $2::jsonb LIMIT 1`,
      [monitor.id, detectedJson]
    )
    if (!detectedRow.rows.length) {
      const version = `v${Date.now().toString(36)}`
      detectedRow = await query(
        `INSERT INTO schemaversion (monitor_id, version, schema_json, status)
         VALUES ($1, $2, $3::jsonb, 'detected') RETURNING *`,
        [monitor.id, version, detectedJson]
      )
    }
    const detectedVersion = detectedRow.rows[0]

    // ChangeEvent per (old,new) pair — skip if already recorded
    const existingChange = await query(
      `SELECT id FROM changeevent WHERE old_schema_id = $1 AND new_schema_id = $2 LIMIT 1`,
      [expectedRow.rows[0].id, detectedVersion.id]
    )
    let changeId = existingChange.rows[0]?.id
    if (!changeId) {
      const primary = breaking.find((c) => c.changeType === 'renamed')
        || breaking.find((c) => c.changeType === 'removed')
        || breaking[0]
      const inserted = await query(
        `INSERT INTO changeevent (monitor_id, old_schema_id, new_schema_id, change_type, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [monitor.id, expectedRow.rows[0].id, detectedVersion.id, primary.changeType]
      )
      changeId = inserted.rows[0].id
    }

    // Only open a new incident when none is already open for this monitor
    const openIncident = await query(
      `SELECT id FROM incident WHERE monitor_id = $1 AND type = 'drift'
         AND status NOT IN ('resolved', 'failed') LIMIT 1`,
      [monitor.id]
    )
    if (openIncident.rows.length) return

    const probableCause = summarize(changes)
    const incident = await query(
      `INSERT INTO incident (monitor_id, type, severity, title, probable_cause, status)
       VALUES ($1, 'drift', 'high', $2, $3, 'open') RETURNING id`,
      [monitor.id, `Schema drift detected on ${monitor.name}`, probableCause]
    )
    await query(
      `INSERT INTO incidentevent (incident_id, kind, actor, payload)
       VALUES ($1, 'detected', 'system', $2::jsonb)`,
      [incident.rows[0].id, JSON.stringify({ source: 'schema-diff', changes, changeId })]
    )
  },
}
