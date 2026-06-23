/**
 * Vocs renders the default export of `footer.tsx` as the `Footer` consumer
 * component, appended inside the site footer on every page (see
 * node_modules/vocs/_lib/app/components/Footer.js). We use it for a persistent
 * "Cookie preferences" control so visitors can withdraw or change analytics
 * consent as easily as they granted it — a GDPR/ePrivacy requirement.
 *
 * It dispatches OPEN_CONSENT_EVENT, which the always-mounted <ConsentBanner>
 * (docs/components/ConsentBanner.tsx) listens for and re-opens.
 */
import { OPEN_CONSENT_EVENT } from './components/ConsentBanner'

export default function Footer() {
  return (
    <div className="stable-footer-consent">
      <button
        type="button"
        className="stable-consent-link"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CONSENT_EVENT))}
      >
        Cookie preferences
      </button>
    </div>
  )
}
