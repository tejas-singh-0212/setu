// Setu seed — pgvector embeddings for the RAG index.
// Run AFTER setup-db.sql:  npm run seed   (from server/)
// Idempotent: existing knowledge embeddings are kept.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { pool } = require('../src/lib/db')
const rag = require('../src/services/rag')

const KNOWLEDGE = [
  'Schema drift detection: upstream renames (capital→capital_city), removed fields (flag), and type changes (population number→string) require a transform or mapping rollback approved through the recovery gate.',
  'Latency anomaly rules: latency above the configured threshold (default 1,000ms) for N consecutive probes (default 3) opens a latency incident; retry with exponential backoff is the first-line recovery.',
  'Dependency checks: DNS resolution and SSL expiry are polled hourly; certificates expiring within 14 days raise a dependency incident and a renewal recommendation.',
  'Recovery safety: config actions only (timeout/retry/cache/mapping rollback), max actions per hour, dry-run default, mandatory human approval, and a post-check probe after every execution.',
  'Incident diagnosis patterns: rules first (type-based root cause), then RAG retrieves similar past incidents from pgvector, then the central LLM writes a two-sentence narrative with a confidence score.',
  'Error burst rules: three or more 5xx responses within five minutes opens an error incident; post-check verification marks it resolved or failed.',
]

async function main() {
  const existing = await pool.query(`SELECT COUNT(*)::int AS n FROM embedding WHERE kind = 'knowledge'`)
  if (existing.rows[0].n >= KNOWLEDGE.length) {
    console.log(`Embeddings already seeded (${existing.rows[0].n} knowledge rows) — nothing to do.`)
    await pool.end()
    return
  }

  let inserted = 0
  for (const content of KNOWLEDGE) {
    const dup = await pool.query(`SELECT id FROM embedding WHERE content = $1 LIMIT 1`, [content])
    if (dup.rows.length) continue
    await rag.index('knowledge', null, content)
    inserted++
  }

  const total = await pool.query(`SELECT COUNT(*)::int AS n FROM embedding`)
  console.log(`Seeded ${inserted} knowledge embeddings — RAG index now has ${total.rows[0].n} rows.`)
  await pool.end()
}

main().catch((e) => {
  console.error('Seed failed:', e.message)
  process.exit(1)
})
