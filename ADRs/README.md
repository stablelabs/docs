# Architectural Design Records (ADRs)

This directory contains Architectural Design Records (ADRs) that document important technical decisions made throughout the project's development.

## Purpose

ADRs capture the context, decision, and consequences of significant architectural choices. They help:
- Preserve decision-making rationale for future reference
- Onboard new team members by explaining why certain approaches were chosen
- Avoid revisiting settled decisions without proper context
- Maintain consistency across the codebase

## Naming Convention

- Start with `DR` followed by a three-digit incremented number and an underscore
- Use descriptive names that clearly indicate the decision being documented
- Format: `DR###_DESCRIPTIVE_NAME.md`
- Example: `DR002_Search_Provider.md`

## Structure

Each ADR should follow this general structure:
1. **Title**: Clear, concise description of the decision
2. **Context**: Background information and problem being solved
3. **Decision**: The approach chosen and how it works
4. **Consequences**: Expected outcomes, trade-offs, and implications

## Current Records

- [DR001: Structured Data (JSON-LD) Strategy](./DR001_SEO_Structured_Data.md) — central JSON-LD / SEO `<head>` injection via the Vocs `head` option
- [DR002: i18n Parity & Translation Pipeline](./DR002_i18n_Sync_Pipeline.md) — en as source of truth; checker + CI gate + auto-draft translation engine to keep cn/ko in sync
- [DR003: Page filenames must not end in `index`](./DR003_Page_Filename_Index_Constraint.md) — Vocs strips a trailing `index` from any filename; `*-index.mdx` pages 404. Use `index.mdx` or a non-`index` suffix.
- [DR004: Translation LLM provider](./DR004_Translation_LLM_Provider.md) — swappable OpenAI-compatible seam (`llm.mjs`) defaulting to OpenRouter + a cheap model, optional review pass, structural + link guards; supersedes DR002 §5–6 internals.
- [DR005: Styleguide enforcement](./DR005_Styleguide_Enforcement.md) — mechanical rules in a single `RULES` source enforced by `verify-style.mjs`, surfaced on PRs as a sticky comment + inline applyable suggestions; judgment rules stay prose.
- [DR006: PostHog Analytics Integration](./DR006_PostHog_Analytics.md) — restore Mintlify-era PostHog via the Vocs `head` option (snippet, not posthog-js); SPA pageviews via `capture_pageview: 'history_change'`
- [DR007: Analytics Consent Gate](./DR007_Analytics_Consent.md) — opt-in consent for the DR006 PostHog integration (GDPR/ePrivacy); inits opted-out + cookieless, site-wide banner via the `Layout` slot, withdraw via a footer link
