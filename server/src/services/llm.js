// LLM client (Part 2) — one OpenAI-compatible chat() against the central
// OSS inference endpoint. Never throws to callers: set LlmUnavailable and let
// callers fall back to rules (parts.md C4 / context.md §1).

class LlmUnavailable extends Error {
  constructor(message) {
    super(message || 'LLM unavailable')
    this.name = 'LlmUnavailable'
    this.status = 503
  }
}

const TIMEOUT_MS = 10000

function isConfigured() {
  return Boolean(process.env.LLM_API_URL)
}

function modelLabel() {
  if (!isConfigured()) return null
  return process.env.LLM_MODEL || 'Llama 3.3 70B (free inference API)'
}

// chat(system, user) → assistant text. Throws LlmUnavailable on any failure.
async function chat(system, user) {
  const base = process.env.LLM_API_URL
  if (!base) throw new LlmUnavailable('LLM_API_URL not configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new LlmUnavailable(`LLM HTTP ${res.status}`)
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new LlmUnavailable('LLM returned no content')
    return text
  } catch (e) {
    if (e.name === 'AbortError') throw new LlmUnavailable('LLM timed out')
    if (e instanceof LlmUnavailable) throw e
    throw new LlmUnavailable(e.message)
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { chat, isConfigured, modelLabel, LlmUnavailable }
