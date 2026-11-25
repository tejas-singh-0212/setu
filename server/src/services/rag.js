// RAG service (Part 2) — pgvector embeddings + similarity retrieval.
// embed(): provider /embeddings when available, otherwise a deterministic
// local hash embedding (384-dim) so the pipeline works with zero keys.

const crypto = require('crypto')
const { query } = require('../lib/db')

const DIM = 384

// ---------- deterministic local embedding (fallback) ----------
function hashEmbed(text) {
  const out = new Array(DIM).fill(0)
  const seed = crypto.createHash('sha256').update(String(text || '')).digest()
  // Expand the 32-byte digest into DIM values with a simple counter-mode hash
  for (let i = 0; i < DIM; i++) {
    const h = crypto
      .createHash('sha256')
      .update(Buffer.concat([seed, Buffer.from([i & 0xff, (i >> 8) & 0xff])]))
      .digest()
    out[i] = ((h[0] << 16) | (h[1] << 8) | h[2]) / 0xffffff - 0.5
  }
  // L2 normalise
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1
  return out.map((v) => Number((v / norm).toFixed(6)))
}

async function providerEmbed(text) {
  const base = process.env.LLM_API_URL
  if (!base || !process.env.LLM_API_KEY) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${base.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({ model: process.env.EMBED_MODEL || 'text-embedding-3-small', input: text }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const vec = data.data?.[0]?.embedding
    return Array.isArray(vec) && vec.length === DIM ? vec : null
  } catch {
    return null
  }
}

async function embed(text) {
  return (await providerEmbed(text)) || hashEmbed(text)
}

function toLiteral(vec) {
  return `[${vec.join(',')}]`
}

// retrieve(query, k) → [{ id, kind, refId, content, score }] most similar first
async function retrieve(text, k = 4) {
  const vec = toLiteral(await embed(text))
  const { rows } = await query(
    `SELECT id, kind, ref_id AS "refId", content,
            1 - (vector <=> $1::vector) AS score
     FROM embedding
     ORDER BY vector <=> $1::vector
     LIMIT $2`,
    [vec, k]
  )
  return rows
}

// index(kind, refId, content) → inserts an embedding row
async function index(kind, refId, content) {
  const vec = toLiteral(await embed(content))
  const { rows } = await query(
    `INSERT INTO embedding (kind, ref_id, content, vector)
     VALUES ($1, $2, $3, $4::vector) RETURNING id`,
    [kind, refId || null, content, vec]
  )
  return rows[0]
}

async function count() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM embedding')
  return rows[0].n
}

module.exports = { embed, retrieve, index, count, DIM, hashEmbed }
