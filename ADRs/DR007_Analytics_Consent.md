# DR007: Analytics Consent Gate

Amends [DR006](./DR006_PostHog_Analytics.md). DR006 restored PostHog event flow;
this record adds the consent gate around it. DR006's core mechanism (the PostHog
loader injected via Vocs' `head` option) stands unchanged — this layers opt-in
consent on top and, in doing so, activates the `Layout`/`footer.tsx` consumer
slots DR006 described as unused.

## Context

As shipped in DR006, PostHog captured `$pageview` on every navigation, ran
autocapture, and set its cookies on first load — unconditionally. That is product
analytics, **not** strictly-necessary error telemetry, so under GDPR / ePrivacy
(and equivalents — UK PECR, etc.) it requires **prior, opt-in consent**: nothing
non-essential may be captured or stored until the visitor actively agrees, reject
must be as easy as accept, and consent must be withdrawable as easily as it was
given. The DR006 build met none of these.

Two ways to comply:

1. **Geo-gate** — only prompt EU/EEA/UK visitors (needs edge/server geo-detection),
   or run PostHog fully cookieless everywhere.
2. **Consent gate everywhere** — initialise opted-out and cookieless, capture
   nothing until the visitor chooses, remember the choice.

## Decision

Take the **consent gate, applied globally** (not geo-gated), so the rule holds in
every region and needs no request-time geo lookup (the docs are statically
prerendered — see DR006).

**PostHog inits suppressed** (`docs/lib/analytics.ts`):

```ts
posthog.init(KEY, {
  /* …DR006 options… */
  opt_out_capturing_by_default: true,  // capture nothing until opt-in
  persistence: 'memory',               // …and set no cookies until opt-in
})
```

`persistence: 'memory'` means the *only* thing stored before consent is the
visitor's own choice, under our own `localStorage` key `stable-analytics-consent`
(`CONSENT_KEY`) — a strictly-necessary value, exempt from consent. On opt-in we
switch to `persistence: 'localStorage+cookie'` and call `opt_in_capturing()`; on
opt-out, `opt_out_capturing()`.

**Honour a prior choice at load.** An inline bootstrap appended to the `head`
snippet reads `CONSENT_KEY` and, if `'granted'`, opts in *before React hydrates* —
so returning consenters are tracked immediately, not one render late. Wrapped in
`try/catch` so blocked storage can never break page load. (The PostHog stub queues
these calls until `array.js` loads, so calling them early is safe.)

**Prompt + withdraw — via the consumer slots DR006 left unused:**

- **`ConsentBanner`** (`docs/components/ConsentBanner.tsx`) mounts site-wide
  through the **default `Layout` export** in `docs/layout.tsx` (a pass-through
  wrapper Vocs renders around every page). It shows only when no choice is stored,
  with **equal-weight Accept / Decline** — neither hidden nor de-emphasised.
- A **"Cookie preferences"** control in the **`footer.tsx`** consumer slot
  re-opens the banner (via an `OPEN_CONSENT_EVENT` window event) so consent can be
  changed or withdrawn as easily as it was granted.

Consent state and the PostHog calls live in `analytics.ts`
(`getConsent` / `grantConsent` / `denyConsent`); the React components only render
and dispatch. Keeps the single analytics seam authoritative (cf. DR006's
"separate module" rationale).

**Why this revises DR006.** DR006 chose the `head` snippet *over* `posthog-js` in
a `Layout` component, and noted the `Layout` slot was unused. That trade-off was
about how the **PostHog loader** ships, and is unchanged — the loader is still the
dependency-free `head` snippet. The consent **UI** is a separate concern and is
the natural use for the `Layout`/`footer` slots; no `posthog-js` dependency is
added (the components drive `window.posthog` directly).

## Consequences

- **Default state is no tracking.** A first-time or declining visitor produces no
  PostHog events and no PostHog cookies. Expect EU analytics volume to drop to
  consenting visitors only — this is the intended, compliant behaviour, not a
  regression.
- **DR006's "snippet on every page" check no longer implies active tracking.** The
  snippet is present everywhere, but capture is gated. To verify tracking, accept
  the banner and watch for `us.i.posthog.com` requests (see Verification).
- **Cross-property consent is not shared.** The choice is stored per-origin in the
  docs' own `localStorage`, so a visitor who accepted on another `stable.xyz`
  property is still asked here. Unifying consent across `*.stable.xyz` would need a
  shared parent-domain cookie + an agreed mechanism across hub/faucet/landing;
  deferred until that pattern is settled.
- **Consent copy/styling is docs-local** and should be reconciled with the other
  properties' banners once they land, for a consistent UX.
- Rotating or removing analytics still happens in `analytics.ts` (DR006); the
  consent helpers and `CONSENT_KEY` live alongside the snippet there.

### Verification

1. **Build:** `npm run docs:build` (Node ≥ 22, per DR006).
2. **Opted out by default:** load a built page fresh (no `stable-analytics-consent`
   in `localStorage`) → banner shows, and no request goes to `us.i.posthog.com`.
3. **Init is gated:** `grep -o "opt_out_capturing_by_default:true" docs/dist/index.html`
   and `grep -o "persistence:'memory'" docs/dist/index.html`.
4. **Accept → tracking on:** click Accept → `$pageview` requests appear to
   `us.i.posthog.com`; reload navigates are captured; the choice persists.
5. **Withdraw:** "Cookie preferences" in the footer re-opens the banner; Decline
   stops capture.
