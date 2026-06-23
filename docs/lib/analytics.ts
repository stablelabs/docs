/**
 * PostHog analytics for the Stable docs — consent-gated.
 *
 * Carried over from the previous Mintlify site (dev-docs/docs.json → `posthog.
 * apiKey`). Keeping the same project key + ingestion host means historical data
 * stays continuous across the migration to Vocs.
 *
 * ## Consent (GDPR / ePrivacy)
 *
 * Pageview + autocapture is product analytics, not strictly-necessary error
 * telemetry, so in the EU/EEA/UK (and similar regimes) it requires *prior,
 * opt-in* consent — capturing must not start until the visitor actively agrees.
 * We enforce that here rather than geo-gate, so the rule holds everywhere:
 *
 *  - PostHog initialises with `opt_out_capturing_by_default: true` and
 *    `persistence: 'memory'` — so on first load it captures nothing and sets no
 *    tracking cookies. The only thing persisted before consent is the user's
 *    own choice (see CONSENT_KEY), which is strictly necessary and exempt.
 *  - The inline bootstrap below re-applies a previously stored "granted" choice
 *    immediately on load (before React hydrates), so returning visitors who
 *    already consented are tracked without delay.
 *  - When no choice is stored, <ConsentBanner> (docs/components/ConsentBanner.tsx)
 *    prompts for one. Accept → `grantConsent()`; Decline → `denyConsent()`.
 *    A "Cookie preferences" footer link (docs/footer.tsx) lets visitors change
 *    their mind later, as easily as they first chose.
 *
 * ## Injection mechanism
 *
 * Vocs' documented `head` config option (see node_modules/vocs/_lib/config.d.ts
 * — "Additional tags to include in the <head> tag of the page HTML").
 * `vocs.config.ts` composes this `analyticsHead()` with the SEO `head()` from
 * structured-data.ts into a single Fragment. We emit the standard PostHog
 * browser snippet so analytics loads async and independently of the app bundle.
 *
 * The key below is a public, write-only project (`phc_…`) key — safe to ship to
 * the browser. The host is PostHog's US ingestion endpoint.
 */

import { createElement, type ReactElement } from 'react'

const POSTHOG_KEY = 'phc_w5S82EA6htCdGahiKPNEskpaEr9PofM5YDKsw8JtfhUi'
const POSTHOG_HOST = 'https://us.i.posthog.com'

/**
 * localStorage key recording the visitor's analytics consent choice.
 * Value is `'granted'` or `'denied'`; absent means "not yet asked".
 * Shared by the inline bootstrap (below) and ConsentBanner so they never drift.
 */
export const CONSENT_KEY = 'stable-analytics-consent'

/**
 * Standard PostHog snippet (verbatim from PostHog's install docs) plus a
 * consent-gated `init` and a bootstrap that honours a stored choice. Config:
 *  - `capture_pageview: 'history_change'` — Vocs is a client-side-routed SPA, so
 *    the default "initial load only" behaviour would miss every in-app
 *    navigation. This fires `$pageview` on pushState/popstate instead.
 *  - `person_profiles: 'identified_only'` — docs traffic is anonymous; avoid
 *    creating a person profile for every visitor.
 *  - `opt_out_capturing_by_default: true` + `persistence: 'memory'` — capture
 *    nothing and set no cookies until the visitor opts in (see consent notes).
 *
 * The bootstrap reads CONSENT_KEY and, if the visitor previously granted
 * consent, switches persistence to cookies and opts in straight away. Wrapped in
 * try/catch so a blocked/absent localStorage can never break page load. The
 * stubbed `posthog` queues these calls until array.js loads, so they are safe to
 * call before the real library is present.
 */
const SNIPPET = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('${POSTHOG_KEY}',{api_host:'${POSTHOG_HOST}',person_profiles:'identified_only',capture_pageview:'history_change',opt_out_capturing_by_default:true,persistence:'memory'});
try{if(localStorage.getItem('${CONSENT_KEY}')==='granted'){posthog.set_config({persistence:'localStorage+cookie'});posthog.opt_in_capturing();}}catch(e){}`

/** The PostHog `<script>` tag, for composition into Vocs' `head` config. */
export function analyticsHead(): ReactElement {
  return createElement('script', {
    key: 'posthog',
    dangerouslySetInnerHTML: { __html: SNIPPET },
  })
}

/* -------------------------------------------------------------------------- */
/* Runtime consent controls — called by ConsentBanner and the footer link.    */
/* All guard `window.posthog`: the snippet defines it synchronously in <head>, */
/* but these are no-ops during SSR / if the snippet is blocked.                */
/* -------------------------------------------------------------------------- */

type PostHog = {
  set_config: (config: Record<string, unknown>) => void
  opt_in_capturing: () => void
  opt_out_capturing: () => void
}

function posthog(): PostHog | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { posthog?: PostHog }).posthog
}

/** Read the stored choice. `null` means the visitor hasn't been asked yet. */
export function getConsent(): 'granted' | 'denied' | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

/** Opt in: persist the choice, switch on cookies, start capturing. */
export function grantConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, 'granted')
  } catch {
    /* storage blocked — still opt in for this session below */
  }
  const ph = posthog()
  ph?.set_config({ persistence: 'localStorage+cookie' })
  ph?.opt_in_capturing()
}

/** Opt out: persist the choice and stop/forbid capturing. */
export function denyConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, 'denied')
  } catch {
    /* storage blocked — still opt out for this session below */
  }
  posthog()?.opt_out_capturing()
}
