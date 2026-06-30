# AGENTS.md

Guidance for AI agents working in this repo. Also read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
and, before architectural changes, search [`ADRs/`](./ADRs).

## Before editing

- Run under Node 22 (`nvm use` from the repo root).
- Edit source content in `docs/pages/en/` only.
- If pages are added, moved, renamed, or deleted, update only the `/en` section
  of `docs/sidebar.json`.
- Run `npm run check` before finishing.

## i18n: English is the source of truth

Content lives in **`docs/pages/en/`** only. The `cn` (Chinese) and `ko` (Korean)
trees are **generated** from English by the translation pipeline — **never
hand-edit `cn`/`ko` content.** Mirror English exactly (same relative paths under
the Diátaxis structure: `explanation/`, `how-to/`, `reference/`, `tutorial/`,
`resources/`).

- **Add/edit a page** → edit `en` only; update `docs/sidebar.json` (`/en/`) if
  pages were added/moved/renamed. The PR's `i18n-translate` workflow generates the
  `cn`/`ko` versions; `i18n-check` blocks the merge if any en page lacks a
  same-path translation.
- **Sidebar** → edit only the `/en` section of `docs/sidebar.json`. The `/cn` and
  `/ko` sections are **generated** from `/en` (links re-prefixed, labels
  translated) — never hand-edit them. Regenerate after editing `/en`:
  ```bash
  LLM_API_KEY=… node docs/lib/i18n-sidebar.mjs cn
  LLM_API_KEY=… node docs/lib/i18n-sidebar.mjs ko
  ```
- **Internal links** are absolute and locale-prefixed (`/en/...` in source). The
  translation pipeline rewrites them to the target locale automatically; never
  point a `cn`/`ko` page at `/en/...`.
- **Delete a page** → `git rm` from `en` **and** the same path in `cn`/`ko`. No
  orphan translations.
- **Generate/refresh translations locally** (e.g. when CI can't, or for a
  freshness pass):
  ```bash
  LLM_API_KEY=… node docs/lib/i18n-translate.mjs cn [--stale] [pages…]
  LLM_API_KEY=… node docs/lib/i18n-translate.mjs ko [--stale] [pages…]
  ```
- **LLM provider/model are env-swappable** (one seam, [`docs/lib/llm.mjs`](./docs/lib/llm.mjs)).
  `LLM_API_KEY` (or `OPENROUTER_API_KEY`) is required; `LLM_BASE_URL` defaults to
  OpenRouter; `TRANSLATE_MODEL` picks the translator and an optional `REVIEW_MODEL`
  enables a second QA pass; `MAX_OUTPUT_TOKENS` (default 8000) must fit the chosen
  model's output cap. Changing provider or model is config, never a code edit.
- **Verify** before finishing: `npm run i18n:check` (expect `0 missing`) and
  `npm run check`.

Full rationale: [`ADRs/DR002_i18n_Sync_Pipeline.md`](./ADRs/DR002_i18n_Sync_Pipeline.md).

## Writing style

Before editing or adding a page, read [`STYLEGUIDE.md`](./STYLEGUIDE.md). It is the
authority on voice, frontmatter (`title` / `description` / `diataxis`), file/folder
rules, callout directives, code blocks, and the Vocs authoring features to use. The
mechanical rules are enforced on every PR by `npm run style:check`
([`docs/lib/verify-style.mjs`](./docs/lib/verify-style.mjs)) — run it before finishing.

## Build

Node `>=22`. `npm run docs:dev` / `docs:build` / `docs:preview`.

Use `npm run check` for the full local gate. It runs the Node preflight, style
check, i18n parity check, TypeScript check, structured-data check, and docs build.

## Common mistakes

- Do not hand-edit `docs/pages/cn/` or `docs/pages/ko/`.
- Do not hand-edit localized sidebar sections; edit only `/en` in
  `docs/sidebar.json`.
- Do not treat green `npm run i18n:check` as proof translations are fresh;
  stale translations are advisory unless `npm run i18n:check:strict` runs.
- Search ADRs before changing i18n, SEO, analytics, consent, style enforcement,
  or Vocs runtime behavior.

## Repo Map

- **Content:** `docs/pages/en/`
- **Generated translations:** `docs/pages/cn/`, `docs/pages/ko/`
- **Navigation:** `docs/sidebar.json`
- **Runtime customization:** `vocs.config.ts`, `docs/layout.tsx`, `docs/styles.css`
- **SEO and analytics:** `docs/lib/structured-data.ts`, `docs/lib/analytics.ts`
- **Automation:** `docs/lib/*.mjs`, `.github/workflows/*`
