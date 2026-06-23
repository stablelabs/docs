import { type ReactNode, useEffect, useState } from 'react'
import { ConsentBanner } from './components/ConsentBanner'

/* ----------------------------- Language label ---------------------------- */
/* The top-nav language dropdown is a Vocs `topNav` item (vocs.config.ts), whose
   trigger text is a static string ("Language"). That's redundant once you're in
   a locale, so we relabel the trigger to the *current* language instead.

   Vocs owns that element, so we can't pass it dynamic text from config. Instead
   we patch the trigger's text node from the locale segment of the URL (/en, /cn,
   /ko). A MutationObserver re-applies the label whenever Vocs re-renders the
   trigger (navigation, hover state), and re-reads the URL each time so it tracks
   client-side route changes. We edit the text node (not textContent) so any
   sibling chevron icon in the trigger is preserved. */
const LANG_LABELS: Record<string, string> = {
  en: 'English',
  cn: '中文',
  ko: '한국어',
}
const KNOWN_LABELS = new Set<string>(['Language', ...Object.values(LANG_LABELS)])

function currentLangLabel() {
  const seg = window.location.pathname.split('/').filter(Boolean)[0]
  return LANG_LABELS[seg] ?? 'English'
}

function relabelLangTrigger() {
  const label = currentLangLabel()
  for (const btn of document.querySelectorAll('button')) {
    for (const node of btn.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue
      const text = node.nodeValue?.trim()
      if (text && text !== label && KNOWN_LABELS.has(text)) node.nodeValue = label
    }
  }
}

let langRelabelInstalled = false
function installLangRelabel() {
  if (langRelabelInstalled || typeof document === 'undefined') return
  langRelabelInstalled = true

  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      relabelLangTrigger()
    })
  }

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  schedule()
}

/* Vocs renders the default export as the `Layout` consumer component — a
   pass-through wrapper around the entire app (every page, every layout variant),
   rendered in vocs' Root outside DocsLayout/LandingLayout. We use it as the
   single mount point for the site-wide analytics consent banner. Keep it a
   transparent wrapper: render `children` unchanged, then the banner. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ConsentBanner />
    </>
  )
}

/* Vocs renders the named `TopNavEnd` export at the end of the top navigation
   (wired via virtual:consumer-components → <rootDir>/layout.tsx). We use it to
   add a theme switcher to the nav, since Vocs only ships its own toggle in the
   mobile nav + sidebar — not the desktop top nav.

   This reuses Vocs' exact mechanism: the `vocs.theme` localStorage key and the
   `.dark` class on <html>, so it stays in sync with the rest of the site. It's
   hidden ≤1080px in CSS (docs/styles.css), where Vocs' own mobile toggle takes
   over, to avoid a duplicate.

   We only show it on the landing page (`layout: landing`, surfaced by Vocs as
   `[data-layout='landing']`); every other page is a docs page where Vocs already
   provides a theme toggle in the sidebar. We re-check on each route change via
   the same MutationObserver the lang relabel uses. */
export function TopNavEnd() {
  const [theme, setTheme] = useState<'light' | 'dark'>()
  const [isLanding, setIsLanding] = useState(false)

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    )
    installLangRelabel()

    const sync = () =>
      setIsLanding(!!document.querySelector('[data-layout="landing"]'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // Avoid a hydration mismatch: render nothing until we know the theme.
  if (!theme || !isLanding) return null

  const next = theme === 'dark' ? 'light' : 'dark'
  const toggle = () => {
    setTheme(next)
    localStorage.setItem('vocs.theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  return (
    <button
      type="button"
      className="stable-nav-theme"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      )}
    </button>
  )
}
