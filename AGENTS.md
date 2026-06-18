# AGENTS.md

Guidance for AI agents working in this repo. Also read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
and, before architectural changes, search [`ADRs/`](./ADRs).

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
  ANTHROPIC_API_KEY=… node docs/lib/i18n-sidebar.mjs cn
  ANTHROPIC_API_KEY=… node docs/lib/i18n-sidebar.mjs ko
  ```
- **Internal links** are absolute and locale-prefixed (`/en/...` in source). The
  translation pipeline rewrites them to the target locale automatically; never
  point a `cn`/`ko` page at `/en/...`.
- **Delete a page** → `git rm` from `en` **and** the same path in `cn`/`ko`. No
  orphan translations.
- **Generate/refresh translations locally** (e.g. when CI can't, or for a
  freshness pass):
  ```bash
  ANTHROPIC_API_KEY=… node docs/lib/i18n-translate.mjs cn [--stale] [pages…]
  ANTHROPIC_API_KEY=… node docs/lib/i18n-translate.mjs ko [--stale] [pages…]
  ```
- **Verify** before finishing: `npm run i18n:check` (expect `0 missing`) and
  `npm run docs:build`.

Full rationale: [`ADRs/DR002_i18n_Sync_Pipeline.md`](./ADRs/DR002_i18n_Sync_Pipeline.md).

## Build

Node `>=22`. `npm run docs:dev` / `docs:build` / `docs:preview`.
