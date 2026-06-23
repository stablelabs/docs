/**
 * Analytics consent banner (GDPR / ePrivacy).
 *
 * PostHog initialises opted-out and cookieless (docs/lib/analytics.ts); nothing
 * is captured until the visitor makes a choice here. We show the prompt only
 * when no choice is stored, so returning visitors aren't re-asked. Accept and
 * Decline are equal-weight — neither is hidden or de-emphasised.
 *
 * Mounted once for the whole site by the default `Layout` export in
 * docs/layout.tsx. The "Cookie preferences" footer link (docs/footer.tsx)
 * re-opens it via the OPEN_CONSENT_EVENT so consent can be withdrawn or changed
 * as easily as it was given.
 */
import { useEffect, useState } from 'react'
import { denyConsent, getConsent, grantConsent } from '../lib/analytics'

/** Footer link dispatches this to re-open the banner for an existing choice. */
export const OPEN_CONSENT_EVENT = 'stable:open-consent'

export function ConsentBanner() {
  // `undefined` until mounted, so SSR and first client render agree (no banner)
  // and we avoid a hydration mismatch; the effect decides whether to show it.
  const [open, setOpen] = useState<boolean>()

  useEffect(() => {
    setOpen(getConsent() === null)
    const reopen = () => setOpen(true)
    window.addEventListener(OPEN_CONSENT_EVENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen)
  }, [])

  if (!open) return null

  const accept = () => {
    grantConsent()
    setOpen(false)
  }
  const decline = () => {
    denyConsent()
    setOpen(false)
  }

  return (
    <div className="stable-consent" role="dialog" aria-label="Analytics consent">
      <p className="stable-consent-text">
        We use cookies to measure how the docs are used so we can improve them.
        Analytics stays off unless you accept.
      </p>
      <div className="stable-consent-actions">
        <button
          type="button"
          className="stable-consent-btn stable-consent-decline"
          onClick={decline}
        >
          Decline
        </button>
        <button
          type="button"
          className="stable-consent-btn stable-consent-accept"
          onClick={accept}
        >
          Accept
        </button>
      </div>
    </div>
  )
}
