// Monitors CRUD service — uses pg pool for database operations

const { Pool } = require('pg')
const { query, execute } = require('../lib/db')

async function listFor(userId) {
  const result = await query(
    'SELECT * FROM monitor WHERE user_id = $1',
    [userId]
  )
  return result.rows
}

async function create(userId, data) {
  const defaultData = {
    type: data.type || 'website',
    url: data.url,
    method: data.method || 'GET',
    interval_sec: data.intervalSec || 60,
    timeout_ms: data.timeoutMs || 5000,
    retries: data.retries ?? 0,
    cache_enabled: data.cacheEnabled ?? false,
    status: data.status || 'active',
    health_score: 100,
  }

  const result = await execute(
    `INSERT INTO monitor (user_id, name, type, url, method, interval_sec, timeout_ms, retries, cache_enabled, status, health_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
     RETURNING *`,
    [
      userId,
      data.name,
      defaultData.type,
      data.url,
      defaultData.method,
      defaultData.interval_sec,
      defaultData.timeout_ms,
      defaultData.retries,
      defaultData.cache_enabled,
      defaultData.status,
      defaultData.health_score,
    ]
  )
  return result.rows[0]
}

async function update(id, data, userId) {
  // Only allow editing certain fields
  const allowed = ['name', 'interval_sec', 'timeout_ms', 'retries', 'cache_enabled', 'status']
  const updateData = {}
  for (const key of allowed) {
    if (key in data) updateData[key] = data[key]
  }
  if (Object.keys(updateData).length === 0) return null

  // Build dynamic update query
  const setCols = Object.keys(updateData).map((key, idx) => `${key} = $${idx + 1}`).join(', ')
  const values = Object.values(updateData)
  values.push(id, userId)

  const result = await query(
    `UPDATE monitor SET ${setCols} WHERE id = $${values.length - 1} AND user_id = $${values.length - 1} RETURNING *`,
    values
  )
  return result.rows[0]
}

async function deleteMon(id, userId) {
  const result = await query(
    'DELETE FROM monitor WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  )
  return result.rows[0]
}

async function getById(id) {
  const result = await query('SELECT * FROM monitor WHERE id = $1', [id])
  return result.rows[0]
}

module.exports = { listFor, create, update, delete: deleteMon, getById }