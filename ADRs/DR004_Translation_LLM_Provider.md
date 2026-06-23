# DR004: Translation LLM provider — swappable seam, cheap model + review

> Supersedes [DR002](./DR002_i18n_Sync_Pipeline.md) §5 (translation engine) and
> §6 (sidebar) **internals only**. DR002's contract — `en` as source of truth,
> the parity checker, the CI gates, block-on-missing/warn-on-stale, the page
> mapping and re-homing — is unchanged and still authoritative. This record
> covers *which model answers and how the call is made*.

## Context

DR002 built the translation engine on `@anthropic-ai/sdk` + **`claude-opus-4-8`**
with adaptive thinking. On a working PR this surfaced three problems:

- **Cost / overkill.** Opus is `$5/$25` per MTok and adaptive thinking bills
  thinking tokens — for a *translation* task that needs neither frontier
  reasoning nor deep thinking. The work is structure-preserving rewriting, which
  mid-tier and cheap models do well.
- **Reliability.** The Opus-backed job hit rate-limit / "credit balance too low"
  failures that blocked the whole `i18n-translate` workflow (the entire batch
  failed once credits ran out mid-run).
- **No swappability.** Provider, model, and key were hard-coded across two
  scripts; trying a cheaper model meant editing code in several places.

A separate, compounding bug was also found and fixed (see Decision §5): the
engine re-translated **every** changed page unconditionally when given explicit
paths, ignoring the `source_sha` freshness check — so each push re-ran the full
changeset through Opus.

The user's decision: move to **OpenRouter** with a cheap model, keep quality
with a **review pass**, and make the LLM **replaceable by configuration, not
code**.

## Decision

### 1. One provider-agnostic seam — `docs/lib/llm.mjs`

All LLM access goes through a single `complete({ model, system, user, maxTokens })`
helper (~30 lines). The two scripts import only this; they never construct a
client or know the wire format.

- **Transport: native `fetch` against the OpenAI Chat Completions format.** No
  SDK. The OpenAI `/chat/completions` shape is the lingua franca every major
  gateway speaks (OpenRouter, OpenAI, Together, Groq, local vLLM/Ollama), so one
  function is portable across all of them. **`@anthropic-ai/sdk` was removed**
  from `package.json` (no remaining importers).
- A small retry (2×, backoff) on `429`/`5xx`/network replaces the SDK's
  auto-retry. Non-streaming for simplicity (cheap models return in seconds; Node
  `fetch` has no client timeout).

### 2. Everything is env-configurable

| Env var | Default | Purpose |
| --- | --- | --- |
| `LLM_API_KEY` | — (falls back to `OPENROUTER_API_KEY`) | Bearer key (required) |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Any OpenAI-compatible endpoint |
| `TRANSLATE_MODEL` | `google/gemini-2.5-flash` | Translation-pass model |
| `REVIEW_MODEL` | *(unset → no review)* | Optional QA-pass model |
| `MAX_OUTPUT_TOKENS` | `8000` | Per-call output cap (must fit the model) |

Swapping provider or model is a workflow `env:` change or a shell var — **zero
code edits**. `.github/workflows/i18n-translate.yml` wires the repo secret
`OPENROUTER_API_KEY` into `LLM_API_KEY` and pins `TRANSLATE_MODEL` +
`MAX_OUTPUT_TOKENS: 32000` (gemini-2.5-flash has a large output window).

### 3. Translate → optional review pipeline

`translateOne()` calls `complete()` with `TRANSLATE_MODEL`; if `REVIEW_MODEL` is
set, it makes a second `complete()` call that hands the model the English source
+ the draft and asks it to correct mistranslations and structural drift. Same
helper, called twice — no pipeline framework. The review pass is the cost/quality
dial: off by default, on by setting one env var.

### 4. Deterministic guards (the real safety net)

Cheap models will occasionally damage structure, so output is validated **before
it is written**:

- **Structural validation** — frontmatter block present, fenced-code-block count
  matches the source, no stray ```` ``` ```` wrapping the file. On failure the
  page throws and is skipped (surfaced in the run) rather than written.
- **Robust link normalization** — `localizeLinks` no longer only rewrites
  `](/en/`. Models "localize" hrefs themselves (emitting `/zh-CN/`, `/ko-KR/`, or
  a duplicated section), so it now rewrites **any** locale/lang prefix
  (`en|cn|ko|zh|zh-cn|ko-kr`) to the target slug and collapses a duplicated
  section segment — touching only the locale prefix, leaving `/images/...` and
  external links alone. This fixed 65 deadlinks that failed the build on the
  first cheap-model run. The no-API `--relink` pass applies the same fix to
  already-generated files.

### 5. Mismatch-only translation (bug fix)

`discover()` previously returned explicit paths verbatim, bypassing the
`source_sha` freshness gate — so CI (which passes every changed en page
explicitly) re-translated the whole PR changeset on every push. Now explicit
paths flow through the same missing-or-drifted check used by a full sweep
(drift is always checked for explicit paths; gated behind `--stale` for a sweep),
with `--force` to re-translate regardless. An in-sync page is now a no-op.

## Consequences

- **~50× cheaper per token** (gemini-2.5-flash ≈ `$0.10/$0.40` vs Opus `$5/$25`)
  and no billed thinking tokens, even with the review pass on.
- **Provider/model are config.** Proven in practice: the first model id 404'd on
  OpenRouter and the fix was a one-line env change, no code.
- **Quality is guarded by deterministic checks + an optional second model**, not
  by the translator's raw fidelity — necessary, because the cheap model did
  mangle link hrefs on the first run (caught and fixed).
- **Lost the SDK's auto-retry**; replaced by the small retry in `complete()` plus
  the existing per-page try/catch and mismatch-only reruns.
- A first full run still costs real (small) money and time (88 pages × 2 locales,
  ~13 min on gemini-2.5-flash) — it is CI-triggered on en changes, drafting only
  the deltas, exactly as in DR002.

## Verification

```bash
# Single page (provider/model from env; --force ignores the freshness skip)
LLM_API_KEY=… TRANSLATE_MODEL=google/gemini-2.5-flash \
  node docs/lib/i18n-translate.mjs cn how-to/use-faucet --force
```

- Inspect the output: frontmatter + `source_sha` intact, code untouched, links
  re-prefixed to `/cn/`, prose translated.
- Swappability: re-run with a different `TRANSLATE_MODEL` / `LLM_BASE_URL` — works
  with no code change. In-sync page → `translating 0 page(s)`.
- Enable review: set `REVIEW_MODEL` and confirm the corrected output.
- `npm run i18n:check` → `0 missing`; `npm run docs:build` → 0 deadlinks.

### What "passing" looks like

| Check | Pass condition |
| --- | --- |
| single-page run | valid MDX, structure preserved, links `/<locale>/`, `source_sha` stamped |
| in-sync page | `translating 0 page(s)` (no API call) |
| `docs:build` | 0 deadlinks across en/cn/ko |
| model/provider swap | env-only, no code change |
