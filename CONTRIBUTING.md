# Contributing to the Stable docs

## Golden rule

**English is the source of truth.** Write and edit content in `docs/pages/en/`
only. The Chinese (`cn`) and Korean (`ko`) pages are generated from English by the
translation pipeline — never hand-edit them except to review a generated draft.

If you find yourself editing a `cn`/`ko` page for anything other than reviewing an
auto-generated translation, you're off-process.

> Why this exists (the full rationale): [`ADRs/DR002_i18n_Sync_Pipeline.md`](./ADRs/DR002_i18n_Sync_Pipeline.md).

## Before editing

- Run `nvm use` so Node 22 is active.
- Edit source content in `docs/pages/en/` only.
- If pages are added, moved, renamed, or deleted, update only the `/en` section
  of `docs/sidebar.json`.
- Run `npm run check` before opening or handing off a PR.

## Writing or updating a page

1. **Edit English only.** New page → create it under the right Diátaxis folder in
   `docs/pages/en/` (`explanation/`, `how-to/`, `reference/`, `tutorial/`,
   `resources/`) with `title` / `description` / `diataxis` frontmatter. Follow
   [`STYLEGUIDE.md`](./STYLEGUIDE.md) for voice, structure, frontmatter, callouts, and
   code-block conventions; `npm run style:check` enforces the mechanical rules in CI.
2. **Update the sidebar if pages were added/moved/renamed.** Edit the `/en`
   section of `docs/sidebar.json` only; the `/cn` and `/ko` sections are
   generated from it (links re-prefixed, labels translated) — never hand-edit them.
3. **Open a PR.** Two workflows run on it:
   - **`i18n-translate`** diffs the en content you changed, translates *just those*
     pages into `cn` + `ko`, regenerates the `/cn`+`/ko` sidebars if the `/en`
     sidebar changed, and commits the result back to your PR branch.
   - **`i18n-check`** enforces parity — every en page must have a same-path
     `cn`/`ko` file (missing = ❌ blocks merge), flags translations whose English
     source drifted (stale = ⚠ warns), and builds all three locales to catch broken
     links.
4. **Review and merge.** Review the English change *and* the auto-generated
   translations in the same PR. Once translations are committed, `i18n-check` goes
   green → merge.

**Steady state: edit en → bot drafts cn/ko into the PR → review → merge.**

## Special cases

- **Deleting a page:** `git rm` it from `en` **and** the same path in `cn`/`ko`.
  No orphan translations — English is the source of truth.
- **Renaming/moving:** `git mv` in `en`, mirror in `cn`/`ko`, and update the
  `/en` section of `docs/sidebar.json`.
- **Fork PRs:** the bot can't push to a fork, so translations won't auto-commit and
  `i18n-check` will fail. A maintainer runs the scripts locally and pushes:
  ```bash
  LLM_API_KEY=… node docs/lib/i18n-translate.mjs cn <changed/page.mdx> …
  LLM_API_KEY=… node docs/lib/i18n-translate.mjs ko <changed/page.mdx> …
  # if the /en sidebar changed:
  LLM_API_KEY=… node docs/lib/i18n-sidebar.mjs cn
  LLM_API_KEY=… node docs/lib/i18n-sidebar.mjs ko
  ```
- **Local checks:**
  ```bash
  npm run i18n:check   # parity + freshness snapshot (0 missing = structurally complete)
  npm run check        # full local gate
  npm run docs:build   # builds en/cn/ko, catches broken links
  npm run docs:dev     # local preview
  ```

## The pipeline at a glance

| Piece | What it does |
| --- | --- |
| `docs/pages/en/**` | Canonical content (Diátaxis structure) |
| `docs/lib/verify-i18n.mjs` (`npm run i18n:check`) | Parity gate (block on missing) + staleness (warn on drifted `source_sha`) |
| `docs/lib/i18n-translate.mjs <cn\|ko> [--stale] [--relink] [pages…]` | Page translation engine (`google/gemini-2.5-flash` by default via `docs/lib/llm.mjs`); stamps `source_path`/`source_sha`. `--relink` = no-API link-prefix backfill |
| `docs/lib/i18n-sidebar.mjs <cn\|ko>` | Regenerates the `/cn`+`/ko` sidebar sections from `/en` (localized links + labels) |
| `.github/workflows/i18n-check.yml` | Runs the gate + build on every PR |
| `.github/workflows/i18n-translate.yml` | Translates a PR's changed en pages + regenerates localized sidebars, in-PR |
| `docs/i18n-allowlist.json` | en paths intentionally left untranslated |

A translation is **fresh** when its frontmatter `source_sha` equals
`git hash-object` of the current en file at the same path; editing the English page
flips it to stale until re-translated.

## Repo Map

- **Content:** `docs/pages/en/`
- **Generated translations:** `docs/pages/cn/`, `docs/pages/ko/`
- **Navigation:** `docs/sidebar.json`
- **Runtime customization:** `vocs.config.ts`, `docs/layout.tsx`, `docs/styles.css`
- **SEO and analytics:** `docs/lib/structured-data.ts`, `docs/lib/analytics.ts`
- **Automation:** `docs/lib/*.mjs`, `.github/workflows/*`
