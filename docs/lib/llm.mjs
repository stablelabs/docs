/**
 * The single LLM seam for the i18n tooling.
 *
 * The translation/sidebar scripts call `complete()` and nothing else — they
 * never know the provider, the wire format, or the endpoint. Swapping provider,
 * gateway, or model is therefore pure configuration (env vars), not a code edit.
 *
 * We speak the OpenAI Chat Completions format over plain `fetch` because every
 * major gateway (OpenRouter, OpenAI, Together, Groq, local vLLM/Ollama, …) speaks
 * it, so one tiny function covers all of them with no SDK dependency.
 *
 * Config:
 *   LLM_BASE_URL   API base (default https://openrouter.ai/api/v1)
 *   LLM_API_KEY    bearer key (OPENROUTER_API_KEY accepted as a fallback)
 *   TRANSLATE_MODEL  model for the translation pass (see callers for defaults)
 *   REVIEW_MODEL     optional second-pass QA model; unset = no review
 */

const BASE = (process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
const KEY = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY

export const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL || 'google/gemini-2.5-flash'
// Unset → callers skip the review pass entirely.
export const REVIEW_MODEL = process.env.REVIEW_MODEL || null
// Output-token ceiling per call. Keep this within the chosen model's max output
// (e.g. Gemini 2.0 Flash ≈ 8192); raise it via env when using a bigger-output
// model so long pages aren't truncated. Over-requesting can make some providers
// reject the call outright, so the default stays conservative.
export const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS) || 8000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * One chat completion: system + user → assistant text. Retries transient
 * failures (429 / 5xx / network) a couple of times with backoff, replacing the
 * auto-retry the SDK used to provide.
 */
export async function complete({ model, system, user, maxTokens }) {
  if (!KEY) throw new Error('LLM_API_KEY (or OPENROUTER_API_KEY) is not set')

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1))
    let res
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body,
      })
    } catch (e) {
      lastErr = e // network error — retry
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
      continue // transient — retry
    }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 500)}`)

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new Error(`unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`)
    return text
  }
  throw lastErr
}
