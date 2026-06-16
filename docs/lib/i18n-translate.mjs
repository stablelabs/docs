/**
 * i18n translation engine.
 *
 * Translates the `en` source pages that are missing or stale in a target
 * locale (`cn` / `ko`) into that locale, preserving MDX structure and
 * frontmatter, and stamping each output with `source_path` + `source_sha` so
 * `verify-i18n.mjs` can track staleness.
 *
 * Used by both the auto-draft CI workflow (.github/workflows/i18n-translate.yml)
 * and one-off local backfills.
 *
 *   ANTHROPIC_API_KEY=... node docs/lib/i18n-translate.mjs <locale> [--stale] [--force] [--limit N] [page ...]
 *
 *   <locale>     cn | ko (required)
 *   --stale      in a full sweep, also re-translate pages whose source_sha drifted (default: missing only)
 *   --force      re-translate every candidate even if its translation is in sync
 *   --limit N    translate at most N pages this run (default: all)
 *   page ...     explicit en-relative paths to consider; in-sync ones are still
 *                skipped (drift is always checked) unless --force is given
 *
 * Model: claude-opus-4-8, adaptive thinking, streamed (pages can be long).
 */

import Anthropic from '@anthropic-ai/sdk'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

const PAGES = 'docs/pages'
const SOURCE = 'en'

const LANGUAGE = { cn: 'Simplified Chinese (zh-CN)', ko: 'Korean (ko-KR)' }

const [locale, ...rest] = process.argv.slice(2)
if (!LANGUAGE[locale]) {
  console.error('Usage: node docs/lib/i18n-translate.mjs <cn|ko> [--stale] [--limit N] [page ...]')
  process.exit(2)
}
const includeStale = rest.includes('--stale')
const force = rest.includes('--force')
const relinkOnly = rest.includes('--relink')
const limitIdx = rest.indexOf('--limit')
const limit = limitIdx !== -1 ? Number(rest[limitIdx + 1]) : Infinity
const explicit = rest.filter(
  (a, i) => !a.startsWith('--') && !(rest[i - 1] === '--limit'),
)

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.mdx')) out.push(p)
  }
  return out
}

function frontmatterSha(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const kv = m[1].match(/^source_sha:\s*(.*)$/m)
  return kv ? kv[1].trim().replace(/^["']|["']$/g, '') : null
}

const blobSha = (file) =>
  execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim()

// en source links are absolute `/en/...`. Rewrite the markdown-link token
// `](/en/` to the target locale so a translated page navigates within its own
// language tree. External URLs that merely contain `/en/` start with `](http`
// and are intentionally left alone. Idempotent.
const localizeLinks = (body, locale) => body.replaceAll('](/en/', `](/${locale}/`)

// Discover which en pages this locale actually needs translating.
//
// Candidates are the explicit paths if given, else every en page. A candidate
// is only translated when its target is missing or its source drifted — so a
// page whose translation already matches the current en `source_sha` is skipped
// (no wasted API call). `--force` re-translates every candidate regardless.
//
// Drift is always checked for explicit paths: the caller named them because
// they changed, so an in-sync one is genuinely nothing to do. For a full sweep
// drift is gated behind `--stale` (otherwise the default is missing-only).
function discover() {
  const candidates = explicit.length
    ? explicit
    : walk(join(PAGES, SOURCE))
        .map((p) => relative(join(PAGES, SOURCE), p))
        .sort()
  if (force) return candidates
  const checkDrift = explicit.length > 0 || includeStale
  const needed = []
  for (const rel of candidates) {
    const target = join(PAGES, locale, rel)
    if (!existsSync(target)) needed.push(rel)
    else if (checkDrift && frontmatterSha(target) !== blobSha(join(PAGES, SOURCE, rel)))
      needed.push(rel)
  }
  return needed
}

const SYSTEM = `You are a professional technical translator for the Stable blockchain developer documentation. Translate English MDX docs into ${LANGUAGE[locale]}.

Rules:
- Translate prose, headings, the frontmatter "title" and "description" values, alt text, and table cell text.
- DO NOT translate: code blocks, inline code, command output, URLs, file paths, frontmatter keys, MDX/JSX component names and props, HTML tags, or identifiers like USDT0, EVM, RPC, JSON-RPC, chain IDs, hex values, env var names.
- Preserve the exact MDX structure: frontmatter fences, import statements, JSX components, links (translate link text, keep the href), and whitespace/indentation.
- Keep the frontmatter "diataxis" value unchanged if present.
- Output ONLY the translated MDX file content, with no commentary, no markdown code fence around the whole file.`

const client = new Anthropic()

async function translateOne(rel) {
  const srcPath = join(PAGES, SOURCE, rel)
  const sha = blobSha(srcPath)
  const source = readFileSync(srcPath, 'utf8')

  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Translate this MDX file:\n\n${source}` }],
  })
  const final = await stream.finalMessage()
  let body = final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  // Inject source tracking into the translated frontmatter so verify-i18n can
  // detect drift later. Assumes the model preserved the leading `---` fence.
  const tracking = `source_path: ${rel}\nsource_sha: ${sha}`
  if (body.startsWith('---\n')) {
    body = body.replace(/^---\n/, `---\n${tracking}\n`)
  } else {
    body = `---\n${tracking}\n---\n\n${body}`
  }

  body = localizeLinks(body, locale)

  const out = join(PAGES, locale, rel)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, body.endsWith('\n') ? body : body + '\n')
  return out
}

// `--relink`: rewrite internal links in already-generated pages to this locale
// without re-translating (no API call, no source_sha change). One-off backfill.
if (relinkOnly) {
  let changed = 0
  for (const p of walk(join(PAGES, locale))) {
    const before = readFileSync(p, 'utf8')
    const after = localizeLinks(before, locale)
    if (after !== before) {
      writeFileSync(p, after)
      changed++
    }
  }
  console.log(`${locale}: relinked ${changed} file(s)`)
  process.exit(0)
}

const pages = discover().slice(0, limit)
console.log(`${locale}: translating ${pages.length} page(s)`)
for (const rel of pages) {
  process.stdout.write(`  → ${rel} ... `)
  try {
    await translateOne(rel)
    console.log('done')
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
    process.exitCode = 1
  }
}
