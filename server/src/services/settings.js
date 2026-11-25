// Settings service (Part 3) — canonical reader/writer for the `setting` table.
// Rows are scoped per user (user_id column); a user with no rows gets DEFAULTS.

const { query, pool } = require('../lib/db')

// Defaults mirror the seeded rows (context.md §5.11) and are used when a row is missing.
const DEFAULTS = {
  latencyThresholdMs: 1000,
  consecutiveSlow: 3,
  maxRecoveryPerHour: 3,
  requireApproval: true,
  dryRunDefault: true,
  probeIntervalDefault: 60,
  ragEnabled: true,
}

// Keys that PUT /api/settings may change, with their validators.
const WRITABLE = {
  latencyThresholdMs: (v) => Number.isInteger(v) && v >= 100 && v <= 10000,
  consecutiveSlow: (v) => Number.isInteger(v) && v >= 1 && v <= 20,
  maxRecoveryPerHour: (v) => Number.isInteger(v) && v >= 1 && v <= 20,
  probeIntervalDefault: (v) => [30, 60, 120, 300].includes(v),
  ragEnabled: (v) => typeof v === 'boolean',
}

// Safety keys that stay locked ON for the demo (C6) — never writable.
const LOCKED = ['requireApproval', 'dryRunDefault']

// AuditLog.entity_id is a NOT NULL uuid; settings have no row id, so use the nil uuid.
const SETTINGS_ENTITY_ID = '00000000-0000-0000-0000-000000000000'

async function getAll(userId) {
  const out = { ...DEFAULTS }
  if (!userId) return out
  const { rows } = await query('SELECT key, value FROM setting WHERE user_id = $1', [userId])
  for (const r of rows) out[r.key] = r.value
  return out
}

async function getSetting(key, userId) {
  if (!userId) return DEFAULTS[key]
  const { rows } = await query('SELECT value FROM setting WHERE key = $1 AND user_id = $2', [key, userId])
  return rows.length ? rows[0].value : DEFAULTS[key]
}

// Returns { errors } when the body is invalid, otherwise { changes } (only keys whose value differs).
function validate(body) {
  const errors = []
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Body must be a JSON object'] }
  }
  const keys = Object.keys(body)
  if (!keys.length) errors.push('No settings provided')
  for (const key of keys) {
    if (LOCKED.includes(key)) {
      errors.push(`${key} is locked ON and cannot be changed`)
    } else if (!(key in WRITABLE)) {
      errors.push(`${key} is not a writable setting`)
    } else if (!WRITABLE[key](body[key])) {
      errors.push(`Invalid value for ${key}`)
    }
  }
  return { errors }
}

// Upserts the given keys for this user and writes one AuditLog row (action
// 'settings.update') in a single transaction.
async function update(body, actor, userId) {
  const before = await getAll(userId)
  const changes = {}
  for (const [key, value] of Object.entries(body)) {
    if (before[key] !== value) changes[key] = { from: before[key], to: value }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const key of Object.keys(changes)) {
      await client.query(
        `INSERT INTO setting (key, value, user_id, updated_at) VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (key, user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(body[key]), userId]
      )
    }
    if (Object.keys(changes).length) {
      await client.query(
        `INSERT INTO auditlog (entity_type, entity_id, action, actor, payload, user_id)
         VALUES ('setting', $1, 'settings.update', $2, $3::jsonb, $4)`,
        [SETTINGS_ENTITY_ID, actor || 'system', JSON.stringify({ changes }), userId]
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  return { settings: await getAll(userId), changed: Object.keys(changes) }
}

module.exports = { DEFAULTS, WRITABLE, LOCKED, getAll, getSetting, validate, update }
