// Database connection using pg (PostgreSQL client)
const { Pool } = require('pg')

const isProduction = process.env.NODE_ENV === 'production'
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not defined')
}

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeout: 30000,
})

// An 'error' on an idle client (Supabase pooler dropping idle connections,
// network blips) would otherwise be an unhandled event → process crash.
// The pool discards the dead client and opens a fresh one on next query.
pool.on('error', (err) => {
  console.error('PG idle client error (recovered, not fatal):', err.message)
})

// Query helper
async function query(text, params) {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result
  } finally {
    client.release()
  }
}

// Execute a command (INSERT, UPDATE, DELETE)
async function execute(text, params) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(text, params)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

module.exports = { query, execute, pool }

module.exports.pool = pool