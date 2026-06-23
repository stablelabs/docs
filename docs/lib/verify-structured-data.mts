/**
 * Reusable verification for the docs JSON-LD.
 *
 * Renders the `head()` output for a set of representative routes, extracts the
 * JSON-LD, asserts it parses, and prints the schema @types + key fields for each.
 * Exits non-zero if any route fails to produce valid JSON-LD.
 *
 * Run from the repo root:
 *   node --experimental-strip-types docs/lib/verify-structured-data.mts
 *
 * (Node 18.19+/20+/22 supports --experimental-strip-types. On newer Node you can
 * drop the flag.)
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { head } from './structured-data.ts'

const routes = [
  '/',
  '/en',
  '/en/explanation/overview',
  '/en/tutorial/quick-start',
  '/en/how-to/create-wallet',
  '/en/reference/json-rpc-api',
  '/en/reference/gas-waiver-api',
  '/en/reference/faq',
  '/en/reference/testnet-version-history',
  '/cn/reference/faq',
  '/ko/reference/faq',
]

let failures = 0

for (const route of routes) {
  const html = renderToStaticMarkup(head({ path: route }))
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)

  if (!m) {
    console.log(`\n## ${route}\n  ✗ NO ld+json emitted`)
    failures++
    continue
  }

  let graph: any
  try {
    graph = JSON.parse(m[1])
  } catch (e) {
    console.log(`\n## ${route}\n  ✗ INVALID JSON: ${(e as Error).message}`)
    failures++
    continue
  }

  const types = graph['@graph'].map((n: any) => n['@type'])
  const article = graph['@graph'].find((n: any) =>
    ['TechArticle', 'APIReference', 'HowTo', 'FAQPage', 'WebPage'].includes(n['@type']),
  )
  const crumb = graph['@graph'].find((n: any) => n['@type'] === 'BreadcrumbList')

  console.log(`\n## ${route}`)
  console.log(`  @types: ${types.join(', ')}`)
  if (article?.['@type'] === 'HowTo')
    console.log(`  HowTo steps: ${article.step?.length ?? 0} (first: ${article.step?.[0]?.name})`)
  if (article?.['@type'] === 'FAQPage')
    console.log(`  FAQ pairs: ${article.mainEntity?.length ?? 0} (first Q: ${article.mainEntity?.[0]?.name})`)
  if (crumb)
    console.log(`  breadcrumb: ${crumb.itemListElement.map((i: any) => i.name).join(' › ')}`)

  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1]
  const hreflangs = [...html.matchAll(/hrefLang="([^"]+)"/g)].map((x) => x[1])
  console.log(`  canonical: ${canonical}${hreflangs.length ? ` | hreflang: ${hreflangs.join(', ')}` : ''}`)
}

console.log(
  `\n${failures === 0 ? '✓ all routes produced valid JSON-LD' : `✗ ${failures} route(s) failed`}`,
)
process.exit(failures === 0 ? 0 : 1)
