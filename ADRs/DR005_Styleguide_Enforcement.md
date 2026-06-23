# DR005: Styleguide enforcement

## Context

The docs had a written [`STYLEGUIDE.md`](../STYLEGUIDE.md) (voice, frontmatter
rules, headings, callouts, code blocks) but **nothing enforced any of it**.
Prose conventions drift, and the mechanical rules (frontmatter presence,
`diataxis` values, description length, code-fence language tags, em dashes,
marketing adjectives) are exactly the kind a machine should catch on every PR
instead of a reviewer doing it by hand.

Two design tensions shaped the decision:

- **Most of a styleguide can't be linted.** Voice, tone, "lead with the outcome,"
  when to use a callout — these are judgment, not regex. Only a small slice is
  mechanically decidable.
- **Duplication drifts.** The mechanical rules' specifics (the length cap, the
  banned-word list, the `diataxis` enum) risk living in two places — the checker
  code *and* the prose — so editing one silently diverges from the other.

## Decision

Split the styleguide into two layers, each with exactly one home, and enforce
only the mechanical layer in CI — surfaced to contributors as PR comments and
applyable suggestions.

### 1. Mechanical checker — `docs/lib/verify-style.mjs`

Wired as `npm run style:check`. Scans `en/**/*.mdx` only (`en` is source of
truth; generated `cn`/`ko` may legitimately differ in punctuation). It is
**Vocs-aware**: it ignores directive markers (`:::note`, `::::steps`,
`:badge[...]`) and treats the first token after a code fence as the language
(allowing trailing meta like `ts twoslash`).

- **Blocking** (non-zero exit): missing `title`/`description`/`diataxis`
  frontmatter, invalid `diataxis`, folder ≠ `diataxis`, over-long `description`,
  a code fence with no language, an em dash in prose.
- **Warning** (advisory): marketing adjectives with no technical meaning.

### 2. Single source of truth for rule values — the `RULES` block

All tunable specifics (valid `diataxis` values, exempt folders, the description
cap, the marketing-word list) live in **one labeled `RULES` block** in
`verify-style.mjs`. `STYLEGUIDE.md` does **not** restate them — it links to the
checker. `npm run style:check -- --rules` prints the enforced rules, so the prose
references a live source instead of a copy that drifts.

This gives a clean update process, documented in STYLEGUIDE.md's "Updating the
styleguide" section:

| To change… | Edit | 
| --- | --- |
| a **mechanical** rule (ban a word, change the cap, add a diataxis type) | the `RULES` block — one place; CI + `--rules` pick it up |
| a **judgment** rule (voice, tone, structure) | the prose in `STYLEGUIDE.md` |

If a rule can't be a value or a small regex, it stays in the prose, not the
checker.

### 3. PR surfacing — `.github/workflows/docs-style.yml`

The findings are made actionable on the PR, not buried in a log:

- **Sticky summary comment** of every finding, grouped by file, each path a
  clickable link to the file **at the PR head commit** with `#L` line anchors.
  Marker-based find-or-update, so re-runs edit one comment instead of stacking.
- **Inline applyable suggestions** for fixes with a safe mechanical correction
  (currently em dash → colon). These are GitHub "suggested changes" the author
  commits with one click. A constraint drives the design: GitHub only allows a
  suggestion on a line **in the PR diff**, so the workflow maps diff hunks to
  added line numbers and posts only those; findings on untouched lines remain in
  the summary comment. Prior bot suggestions are deleted before re-posting.
- **Enforcement is preserved**: the job still exits non-zero on blocking issues
  (the comment is informational, not a replacement for the gate). Marketing-word
  warnings never block.

The checker writes the comment markdown (`STYLE_REPORT`) and the suggestion JSON
(`STYLE_SUGGESTIONS`) only when those env vars are set, so local runs are
unaffected.

## Consequences

- **Mechanical rules are enforced uniformly**; reviewers stop hand-catching em
  dashes and missing frontmatter.
- **Changing an enforced value is a one-place edit** with no prose drift.
- **Suggestions are diff-scoped** — a finding on a line the PR didn't touch can't
  carry an applyable suggestion (GitHub limitation); it shows in the summary
  only. The log reports posted-vs-skipped counts so this isn't silent.
- **Only em dashes auto-suggest today.** Marketing-word fixes are intentionally
  *not* auto-suggested — deleting an adjective often mangles the sentence — so
  they stay advisory.
- **The judgment layer is still unenforced by design.** It relies on review (and,
  optionally, the LLM review pass). A richer prose linter (**Vale** — declarative
  YAML rules, editor + CI integration) is the natural next step if the team wants
  to enforce sentence length, passive voice, etc.; it would complement, not
  replace, the repo-specific checks (diataxis↔folder, frontmatter, Vocs-aware
  fences) this checker does. See also the `*-index.mdx` lint-rule follow-up
  flagged in [DR003](./DR003_Page_Filename_Index_Constraint.md) — `verify-style.mjs`
  is the natural home for it.

## Verification

```bash
npm run style:check            # check pages (non-zero exit on blocking issues)
npm run style:check -- --rules # print the enforced rules
```

- Introduce an em dash in an `en` page → blocking failure; `connect.mdx`-style
  list separators must be colons.
- On a PR, confirm the sticky summary comment appears with line-anchored links
  and an inline suggestion on a changed line carrying an em dash.

### What "passing" looks like

| Check | Pass condition |
| --- | --- |
| `style:check` | `0 blocking` (warnings allowed) |
| `--rules` | prints the current enforced rules from `RULES` |
| `docs-style.yml` | comments findings; fails only on blocking issues |
