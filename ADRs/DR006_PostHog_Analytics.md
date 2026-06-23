# DR006: PostHog Analytics Integration

> **Amended by [DR007](./DR007_Analytics_Consent.md):** the `posthog.init` config
> and the "`Layout` slot unused" / "not via `Layout`" framing below predate the
> consent gate. PostHog now initialises opted-out and cookieless until the visitor
> consents, and the `Layout`/`footer.tsx` slots carry the consent UI. The `head`
> snippet mechanism for the PostHog **loader** (the decision recorded here) is
> unchanged.

## Context

The previous Mintlify docs site reported into PostHog via Mintlify's built-in
integration — a single key in `dev-docs/docs.json`:

```json
"posthog": { "apiKey": "phc_w5S82EA6htCdGahiKPNEskpaEr9PofM5YDKsw8JtfhUi" }
```

The migration to Vocs dropped this; the new site sent **no analytics** and
`vocs.config.ts` carried only a "wire PostHog later" TODO. We needed to restore
reliable event flow into the **same** PostHog project so historical data stays
continuous across the migration.

Two constraints shaped the decision:

1. **Same project, no break in continuity.** Reuse the existing project key
   (`phc_…`, public/write-only — safe to ship to the browser) and PostHog's US
   ingestion host (`https://us.i.posthog.com`), which is the host Mintlify's
   integration defaulted to.
2. **Vocs is a client-side-routed SPA.** A plain analytics snippet captures the
   initial page load only; in-app navigations between docs pages would be missed.

Vocs (on **v1.4.1** at the time of this decision) has **no dedicated analytics
feature**, and the hosted docs have no analytics guide (`vocs.dev/docs/guides/
analytics` 404s). The framework offers two documented extension points, confirmed
from the installed type defs / source rather than the website:

- **`head` config option** (`node_modules/vocs/_lib/config.d.ts`: *"Additional
  tags to include in the `<head>` tag of the page HTML"*) — a `ReactElement`,
  path-map, or `(params) => ReactElement` rendered into `<head>` at static-build
  time. Already used in this repo for JSON-LD/SEO (see
  [DR001](./DR001_SEO_Structured_Data.md)).
- **`layout.tsx` consumer components** — Vocs reads `rootDir/layout.tsx` for a
  default `Layout` export (wraps the whole app, client-side) plus named exports
  like `TopNavEnd` (`node_modules/vocs/_lib/vite/plugins/virtual-consumer-
  components.js`). The repo already uses `TopNavEnd`; the default `Layout` slot is
  unused.

## Decision

Inject the **standard PostHog browser snippet** via the Vocs **`head` option** —
*not* via `posthog-js` in a `Layout` component.

The snippet lives in its own module, **`docs/lib/analytics.ts`**, exporting
`analyticsHead(): ReactElement` (a `<script>` with the PostHog loader +
`posthog.init`). `vocs.config.ts` composes it with the existing SEO `head()` into
a single `Fragment`, since Vocs' `head` takes one value:

```ts
head: (params) =>
  createElement(Fragment, null, analyticsHead(), seoHead(params)),
```

**`posthog.init` config that matters:**

- `api_host: 'https://us.i.posthog.com'` + the migrated `phc_…` key — same
  project as Mintlify, so data is continuous.
- `capture_pageview: 'history_change'` — fires `$pageview` on
  `pushState`/`popstate`, which is what makes SPA navigation tracking reliable.
  Without it only the initial load would be counted.
- `person_profiles: 'identified_only'` — docs traffic is anonymous; don't create
  a person profile per visitor.

**Why the `head` snippet over `posthog-js` in `Layout`:**

| | `head` snippet (chosen) | `Layout` + `posthog-js` |
| --- | --- | --- |
| Reliability | Loads async, independent of the app bundle — keeps reporting even if React fails to hydrate. Mirrors what Mintlify did. | Tied to bundle hydration. |
| Dependencies | None | Adds `posthog-js` (+ provider) to the build. |
| SPA pageviews | `capture_pageview: 'history_change'` | React effect / provider |
| Repo fit | Reuses the existing `head` injection pattern (DR001). | Would activate the unused `Layout` slot. |

Reliability of event flow was the priority, so the dependency-free, bundle-
independent snippet won.

**Why a separate module, not `structured-data.ts`:** that file is intentionally
single-purpose (SEO/JSON-LD per DR001). Keeping analytics in `analytics.ts` and
composing in config keeps each concern self-documenting and the snippet trivial to
find or remove.

## Consequences

- All built pages (~379 HTML files in `docs/dist`) carry the PostHog snippet, and
  the SEO JSON-LD `head` from DR001 is unaffected — the two are composed, not
  competing.
- The public key is committed in `docs/lib/analytics.ts`. This is by design for a
  client-side analytics key; rotating the PostHog project means editing the
  `POSTHOG_KEY`/`POSTHOG_HOST` constants there.
- The snippet string is the verbatim PostHog loader. To re-sync it with a newer
  PostHog snippet, replace the `SNIPPET` body but keep the `posthog.init` options
  above.
- **Node ≥ 22 is required to build** (`package.json` engines / `.nvmrc`). On older
  Node the Vocs build fails with an unrelated `globSync` import error — not an
  analytics issue.

### Verification

1. **Build:** `npm run docs:build` (Node ≥ 22).
2. **Snippet present on every page** (zsh-safe — avoid `--include`):
   ```bash
   echo "with key:  $(grep -rl 'phc_w5S82EA6' docs/dist | wc -l)"
   echo "html total: $(find docs/dist -name '*.html' | wc -l)"   # should match
   ```
3. **SPA config present:** `grep -o "capture_pageview:'history_change'" docs/dist/index.html`
4. **Live ingestion** (not verifiable from a static build): run `npm run docs:dev`
   or check the deployed site, then watch PostHog's *Activity / live events*, or
   the Network tab for requests to `us.i.posthog.com`.
