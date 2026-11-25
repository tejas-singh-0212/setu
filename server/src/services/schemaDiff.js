// schemaDiff (Part 2) — pure schema extraction + diff/classification logic
// used by hooks/afterProbe/schemaDiff.js.

// ---------- extraction ----------

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v // number | string | boolean | object
}

// inferSchema(payload) → { fields: { name: type } }
// Arrays of records use the first element as the representative object
// (REST-style collections); empty/odd payloads yield null.
function inferSchema(payload) {
  let obj = payload
  if (Array.isArray(obj)) obj = obj[0]
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const fields = {}
  for (const [k, v] of Object.entries(obj)) fields[k] = typeOf(v)
  return { fields }
}

// Normalise stored SchemaVersion.schema_json ({fields:[names]} | {fields:{name:type}})
function normalizeExpected(schemaJson) {
  if (!schemaJson) return null
  const f = schemaJson.fields
  if (Array.isArray(f)) {
    const fields = {}
    for (const name of f) fields[name] = 'any'
    return { fields }
  }
  if (f && typeof f === 'object') return { fields: { ...f } }
  return null
}

// ---------- diff ----------

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[n]
}

function nameSimilarity(a, b) {
  const d = levenshtein(a.toLowerCase(), b.toLowerCase())
  const max = Math.max(a.length, b.length)
  return max === 0 ? 0 : 1 - d / max
}

// diffSchemas(expected, detected) → changes[]
// changeType ∈ renamed | removed | type_changed | added
// A removed field paired with a similar added field (same type when known)
// becomes a rename — the canonical `capital → capital_city` case.
function diffSchemas(expected, detected) {
  if (!expected || !detected) return []
  const exp = expected.fields || {}
  const det = detected.fields || {}

  const changes = []
  const removed = Object.keys(exp).filter((f) => !(f in det))
  const added = Object.keys(det).filter((f) => !(f in exp))
  const kept = Object.keys(exp).filter((f) => f in det)

  const pairedAdded = new Set()
  for (const r of removed) {
    let best = null
    let bestScore = 0
    for (const a of added) {
      if (pairedAdded.has(a)) continue
      const typeOk = exp[r] === 'any' || det[a] === 'any' || exp[r] === det[a]
      if (!typeOk) continue
      const score = nameSimilarity(r, a)
      if (score > bestScore) {
        bestScore = score
        best = a
      }
    }
    if (best && bestScore >= 0.5) {
      pairedAdded.add(best)
      changes.push({ changeType: 'renamed', field: r, to: best, fromType: exp[r], toType: det[best] })
    } else {
      changes.push({ changeType: 'removed', field: r, fromType: exp[r] })
    }
  }

  for (const a of added) {
    if (pairedAdded.has(a)) continue
    changes.push({ changeType: 'added', field: a, toType: det[a] })
  }

  for (const f of kept) {
    if (exp[f] !== 'any' && det[f] !== 'any' && exp[f] !== det[f]) {
      changes.push({ changeType: 'type_changed', field: f, fromType: exp[f], toType: det[f] })
    }
  }

  return changes
}

// short human line for Incident.probable_cause
function summarize(changes) {
  if (!changes.length) return 'No contract changes detected'
  const parts = changes.slice(0, 3).map((c) => {
    if (c.changeType === 'renamed') return `renamed \`${c.field}\` → \`${c.to}\``
    if (c.changeType === 'removed') return `removed \`${c.field}\``
    if (c.changeType === 'added') return `added \`${c.field}\``
    if (c.changeType === 'type_changed') return `\`${c.field}\` changed ${c.fromType}→${c.toType}`
    return c.field
  })
  const more = changes.length > 3 ? ` (+${changes.length - 3} more)` : ''
  return `Upstream contract change: ${parts.join(', ')}${more}`
}

module.exports = { inferSchema, normalizeExpected, diffSchemas, summarize, nameSimilarity }
