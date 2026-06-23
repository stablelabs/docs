# DR002: i18n Parity & Translation Pipeline

## Context

The docs site ships three locales (`en`, `cn`, `ko`) via the Vocs `topNav`
language switcher, but the locales had drifted badly out of sync:

| Signal | Before |
| --- | --- |
| `en` pages | **126** (125 sidebar links) |
| `cn` pages | **49** |
| `ko` pages | **49** |
| `cn` vs `ko` structure | **identical to each other** (same 49 relative paths) |
| Page tree | `en` uses Diátaxis (`explanation/`, `how-to/`, `reference/`, `tutorial/`, `resources/`); `cn`/`ko` used an older layout (`architecture/`, `developers/`, `introduction/`, `resources/`) |
| Path mapping `en` ↔ `cn`/`ko` | **not 1:1** — same topics lived at different paths *and* filenames (e.g. `cn/developers/node-operations/installation.mdx` ↔ `en/how-to/install-node.mdx`) |

A reader switching to 中文/한국어 landed on a third of the content, under a
different navigation tree. ~77 English pages had no translation at all (entire
sections — Payments, AI agents/x402, SDK, Contracts/Accounts, most reference API
pages, tutorials). Worse, closing the gap once would not keep it closed: nothing
prevented a new `en` page from shipping without translations.

What we had to build on: `en` is the canonical, fully-built-out content set, and
its `diataxis` frontmatter gives a clean target taxonomy. The sidebar
(`docs/sidebar.json`, keyed `/en/ /cn/ /ko/`) is hand-maintained — the
`migrate.py` referenced in `vocs.config.ts` comments no longer exists. There was
no CI in the repo (`.github/` did not exist). An existing verification-script
convention lives at `docs/lib/verify-structured-data.mts`.

Two product decisions were made with the user up front:
1. **Standardize `cn`/`ko` on the English Diátaxis structure.**
2. **English is the source of truth, always** — a translation with no English
   counterpart is retired, not kept.

## Decision

Treat `en` as the single source of truth and enforce a **sync contract** in CI,
backed by a translation engine that auto-drafts the missing pages. Concretely:

### 1. Page mapping (`docs/i18n-mapping.json` + `.md`)

A machine-readable manifest of every old `cn`/`ko` path → canonical `en` path,
with a status per row. It drove the one-time re-homing and documents the
restructure:

| status | meaning | count |
| --- | --- | --- |
| `rename` | translation existed at a different path/filename → `git mv` to the `en` path | 44 |
| `rehome` | translation already at the `en` path (`index.mdx`, `resources/brand-kit.mdx`) | 2 |
| `translate` | `en` page with no translation → author cn + ko | 80 |
| `retire` | cn/ko page with no `en` counterpart → delete | 3 |

Duplicate basenames (five `overview.mdx`, two `version-history.mdx` per locale)
were disambiguated by directory context, not basename — e.g.
`architecture/core-optimization/overview.mdx` → `explanation/core-optimization-overview.mdx`,
and the two `version-history` pages map cleanly onto en's `mainnet-` /
`testnet-version-history` split.

### 2. Re-homing (one-time)

All 44 `rename` pages were moved in both locales with `git mv` (history
preserved) to mirror the `en` tree exactly. The 3 orphans
(`introduction/why-stable`, `introduction/stable-for-users`,
`resources/official-links`) were `git rm`'d from both locales — English dropped
those concepts in the restructure, and English is the source of truth.

> **`source_sha` is intentionally *not* stamped on re-homed pages.** They were
> translated from an older `en` revision, so stamping the current sha would
> falsely mark them fresh. Leaving them unstamped makes the checker report them
> as "untracked — needs review" warnings, which feeds the freshness pass.

### 3. Sync contract — the checker (`docs/lib/verify-i18n.mjs`)

Modeled on `verify-structured-data.mts` (plain `.mjs` so it runs on any Node ≥20
without the type-strip flag). Wired as `npm run i18n:check`. It:

- Enumerates `en/**/*.mdx`; asserts a same-path file exists in `cn` and `ko`.
  **Missing → non-zero exit (blocks merge.)**
- Compares each translation's frontmatter `source_sha` to `git hash-object` of
  the current `en` file. **Drift or absent → warning** (advisory, does not
  block).
- `docs/i18n-allowlist.json` lists `en` paths intentionally untranslated.

The enforcement level was chosen with the user: **block on missing, warn on
stale.**

### 4. CI gates (`.github/workflows/`)

- **`i18n-check.yml`** — on PRs touching `docs/pages/**` / `sidebar.json` /
  the checker: runs `npm run i18n:check` (blocks on missing) then
  `npm run docs:build` (catches broken links / orphaned sidebar entries across
  all three locales).
- **`i18n-translate.yml`** — on **pull requests** touching `docs/pages/en/**`
  **or `docs/sidebar.json`**: diffs the PR against the base, translates *only*
  the changed en pages into cn/ko, and — if the sidebar changed — regenerates the
  `/cn`+`/ko` sidebar sections from `/en` (see §6). Both land in the **same PR**
  as the source edit, so the "block on missing" gate passes within one PR — no
  separate post-merge step. The job is scoped to the PR's changes (not a global
  sweep), so it doesn't churn the site or re-touch the untracked re-homed pages
  on unrelated PRs. Fork PRs are skipped (read-only token); a maintainer runs the
  scripts locally for those. Pushing the bot's translation commit re-triggers the
  workflow; a guard step bails when the tip commit's author is `github-actions[bot]`
  (LLM output isn't byte-stable, so a "nothing changed" check isn't enough to stop
  a loop) — self-terminating.

### 5. Translation engine (`docs/lib/i18n-translate.mjs`)

> **Superseded by [DR004](./DR004_Translation_LLM_Provider.md).** The provider/
> model below (Anthropic SDK, `claude-opus-4-8`, `ANTHROPIC_API_KEY`) was
> replaced by a swappable OpenAI-compatible seam (`docs/lib/llm.mjs`) defaulting
> to OpenRouter + a cheap model, with an optional review pass and structural
> validation. Use `LLM_API_KEY` and see DR004 for current usage. The discovery
> behavior also changed: explicit paths now skip in-sync pages (drift is always
> checked), with `--force` to override. The rest of this section is retained as
> the original record.

```
ANTHROPIC_API_KEY=... node docs/lib/i18n-translate.mjs <cn|ko> [--stale] [--limit N] [page ...]
```

Uses `@anthropic-ai/sdk` (added to `package.json`) + **`claude-opus-4-8`**,
adaptive thinking, streamed (`max_tokens: 64000` — pages can be long). The system
prompt translates prose/headings/frontmatter `title`+`description` while
preserving code blocks, inline code, URLs, file paths, frontmatter keys, JSX
component names/props, and identifiers (USDT0, EVM, RPC, hex values, …). It
stamps `source_path` + `source_sha` into the output frontmatter so the page is
tracked from creation. Discovers missing (and, with `--stale`, drifted) pages
itself, or takes explicit paths.

### 6. Sidebars (`docs/lib/i18n-sidebar.mjs`)

> **Engine superseded by [DR004](./DR004_Translation_LLM_Provider.md):** the
> "batched Opus call" is now the provider-agnostic `complete()` seam (cheap model
> by default, optional review). The structure/regeneration logic below is
> unchanged.

`en` is the source of truth for sidebar *structure* too: only the `/en` section
of `docs/sidebar.json` is hand-maintained. `i18n-sidebar.mjs <cn|ko>` regenerates
the `/cn` and `/ko` sections from `/en` — it deep-clones the tree, swaps each
`link` prefix (`/en/` → `/<locale>/`, the same token as the page engine's
`localizeLinks`), and **translates the `text` labels** in one batched, deduped
Opus call (preserving identifiers — SDK, USDT0, x402, MPP, EIP-7702, …). Output
is written with `JSON.stringify(…, 2)` and no trailing newline to match the
existing file format and key order. Page titles still come from the (translated)
frontmatter; the sidebar labels are now localized rather than English. Run after
editing the `/en` section; CI regenerates them automatically (§4).

## Consequences

- **The gap can't silently reopen.** Any `en` page added without a same-path
  `cn`/`ko` file fails CI; any `en` page edited without re-syncing its
  translations surfaces as a stale warning. The translate workflow drafts the
  cn/ko pages into the same PR as the en change, so the everyday flow is a
  single PR: edit en → bot commits translations → review → merge.
- **`docs:build` is intentionally red mid-migration** until the 160 missing
  translations (80 × 2 locales) are generated — the cn/ko sidebars point at
  pages that don't exist yet. It goes green once the translation run lands the
  files.
- The 44 re-homed pages show as "untracked" warnings until a **freshness pass**
  diffs them against current `en` and stamps `source_sha`.
- Running the full translation requires `ANTHROPIC_API_KEY` and incurs Opus API
  spend (~160 streamed calls); it is a deliberate, human-triggered operation,
  not part of CI on every push (CI only drafts deltas).

## Verification & testing

Run from the repo root.

### Step 1 — Parity + staleness (fast, ~seconds)

```bash
npm run i18n:check
```

Per-locale summary of `missing (blocking)` and `stale (warn)`, ending in a
`✓`/`✗` line. **Exit 0 only when zero pages are missing.** Mid-migration it
reports the outstanding `translate` count; after the translation run it should
report `0 missing`.

### Step 2 — Translate the missing pages

> The `ANTHROPIC_API_KEY` invocations below are superseded by
> [DR004](./DR004_Translation_LLM_Provider.md) — use `LLM_API_KEY` (the engine
> now calls an OpenAI-compatible provider, OpenRouter by default).

```bash
ANTHROPIC_API_KEY=... node docs/lib/i18n-translate.mjs cn
ANTHROPIC_API_KEY=... node docs/lib/i18n-translate.mjs ko
```

Prints `→ <path> ... done`/`FAILED` per page. (Auth failures here mean the key
isn't exported into the process environment — a `.env` that uses a different
variable name or an un-exported `source` is the usual cause.)

To localize the sidebar after editing its `/en` section:

```bash
ANTHROPIC_API_KEY=... node docs/lib/i18n-sidebar.mjs cn
ANTHROPIC_API_KEY=... node docs/lib/i18n-sidebar.mjs ko
```

A no-API link-only backfill for existing translated pages is also available:
`node docs/lib/i18n-translate.mjs <cn|ko> --relink`.

### Step 3 — Full build across all locales

```bash
npm run docs:build
```

Passes only when every sidebar link in all three locales resolves — the
end-to-end proof the migration is complete and consistent.

### Step 4 — CI

Open a PR editing one `en` page: `i18n-translate` commits the cn/ko translations
back to the PR branch, after which `i18n-check` passes on the updated PR. A fork
PR (read-only token) skips translation and the parity gate fails until a
maintainer runs the engine locally.

### What "passing" looks like

| Check | Pass condition |
| --- | --- |
| `i18n:check` | `0 missing` (stale warnings allowed until the freshness pass) |
| `docs:build` | builds clean for en/cn/ko, no broken links |
| `i18n-check.yml` | red on a missing-translation PR |
| `i18n-translate.yml` | opens draft PRs on en changes to main |
