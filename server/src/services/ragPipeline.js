// RAG pipeline client — server-side HTTP wrapper for the FastAPI service in
// ./rag_pipeline (Chroma + Groq schema-fix suggestions).
//
// Contract (rag_pipeline/api.py):
//   GET  /health                                → { status, indexed_fixes }
//   POST /internal/v1/schema-fix-suggestions    → suggestion (X-User-Id header)
//
// Everything degrades gracefully: if the pipeline is down or slow, callers
// get null and fall back to the built-in behaviour, so the demo never dies.

const BASE = () => (process.env.RAG_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

// change: { changeId, changeType, diffSummary, expectedSchema, observedSchema }
// changeType uses the pipeline's vocabulary (field_renamed | type_changed |
// field_moved_or_nested) — callers map from ChangeEvent.change_type.
// Returns the parsed suggestion, or null on any failure.
async function suggestFix(change, userId, timeoutMs = 10000) {
  if (!userId) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`${BASE()}/internal/v1/schema-fix-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': String(userId),
        // Shared secret proving the call comes from this backend (see rag_pipeline/api.py)
        ...(process.env.RAG_SERVICE_TOKEN ? { 'X-Internal-Token': process.env.RAG_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify({
        change_id: String(change.changeId),
        provider: null, // omit: dataset providers are demo-* names, not monitor names
        change_type: String(change.changeType),
        diff_summary: String(change.diffSummary || '').slice(0, 2000),
        expected_schema: change.expectedSchema || {},
        observed_schema: change.observedSchema || {},
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// → { available: boolean, indexedFixes: number|null, url: string }
async function status(timeoutMs = 2500) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`${BASE()}/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { available: false, indexedFixes: null, url: BASE() }
    const health = await res.json()
    return {
      available: health.status === 'ok',
      indexedFixes: typeof health.indexed_fixes === 'number' ? health.indexed_fixes : null,
      url: BASE(),
    }
  } catch {
    return { available: false, indexedFixes: null, url: BASE() }
  }
}

module.exports = { suggestFix, status }
