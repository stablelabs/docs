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
 *   LLM_API_KEY=... node docs/lib/i18n-translate.mjs <locale> [--stale] [--force] [--limit N] [page ...]
 *
 *   <locale>     cn | ko (required)
 *   --stale      in a full sweep, also re-translate pages whose source_sha drifted (default: missing only)
 *   --force      re-translate every candidate even if its translation is in sync
 *   --limit N    translate at most N pages this run (default: all)
 *   page ...     explicit en-relative paths to consider; in-sync ones are still
 *                skipped (drift is always checked) unless --force is given
 *
 * Provider/model are env-configurable via docs/lib/llm.mjs (LLM_BASE_URL,
 * LLM_API_KEY, TRANSLATE_MODEL, REVIEW_MODEL). When REVIEW_MODEL is set, a
 * second model reviews and corrects each draft before it's written.
 */

import { complete, TRANSLATE_MODEL, REVIEW_MODEL, MAX_OUTPUT_TOKENS } from './llm.mjs'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

const PAGES = 'docs/pages'
const SOURCE = 'en'

const LANGUAGE = { cn: 'Simplified Chinese (zh-CN)', ko: 'Korean (ko-KR)' }

const [locale, ...rest] = process.argv.slice(2)
if (!LANGUAGE[locale]) {
  console.error('Usage: LLM_API_KEY=... node docs/lib/i18n-translate.mjs <cn|ko> [--stale] [--force] [--limit N] [page ...]')
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

// Normalize internal markdown-link hrefs to the target locale tree. en source
// links are `](/en/...)`, but translation models often "localize" the path
// themselves — emitting the language tag (`/zh-CN/`, `/ko-KR/`), the wrong
// locale slug, or a duplicated section. This rewrites the locale prefix of any
// `](/<loc>/...)` link to `](/<locale>/...)` and collapses a duplicated section
// segment. Only the locale prefix is touched, so asset paths like `/images/...`
// and external `](http...)` links are left alone. Idempotent.
const LOCALE_TOKENS = 'en|cn|ko|zh|zh-cn|ko-kr'
const SECTIONS = 'tutorial|how-to|reference|explanation|resources'
const localizeLinks = (body, locale) =>
  body
    .replace(new RegExp(`\\]\\(/(?:${LOCALE_TOKENS})/`, 'gi'), `](/${locale}/`)
    .replace(new RegExp(`\\]\\(/${locale}/(${SECTIONS})/\\1/`, 'g'), `](/${locale}/$1/`)

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
- Internal links use \`/en/...\` paths. Keep the href EXACTLY as \`/en/...\` — do not change the \`/en/\` prefix to a language tag or locale, and do not alter the path.
- Keep the frontmatter "diataxis" value unchanged if present.
- Output ONLY the translated MDX file content, with no commentary, no markdown code fence around the whole file.`

const REVIEW_SYSTEM = `You are a senior reviewer for ${LANGUAGE[locale]} translations of the Stable blockchain developer docs. You are given the English source MDX and a draft translation. Return a corrected version of the translation.

Fix:
- Any untranslated prose, mistranslations, or awkward phrasing.
- Any structural drift from the source: the draft MUST keep the same frontmatter keys, the same number and content of fenced code blocks, the same inline code, URLs, file paths, JSX/MDX components and props, HTML tags, and identifiers (USDT0, EVM, RPC, etc.) — all unchanged from the English.
- Keep the frontmatter "diataxis" value unchanged. Translate frontmatter "title"/"description" values only.

Output ONLY the corrected MDX file content — no commentary, no markdown code fence around the whole file. If the draft is already correct, output it unchanged.`

// Count top-level fenced code blocks (``` or ~~~) in MDX prose. Used as a cheap
// structural check: a faithful translation keeps every code block intact.
const fenceCount = (text) => (text.match(/^\s*(`{3,}|~{3,})/gm) || []).length

// Reject a generation that lost structure rather than writing corrupt output.
// Throwing here skips the page and surfaces it in the run (per-page try/catch).
function validateStructure(rel, source, out) {
  if (!out) throw new Error('empty translation')
  if (/^\s*```/.test(out)) throw new Error('translation is wrapped in a markdown code fence')
  if (source.startsWith('---\n') && !out.startsWith('---\n'))
    throw new Error('translation dropped the frontmatter block')
  const want = fenceCount(source)
  const got = fenceCount(out)
  if (got !== want) throw new Error(`code-fence count drifted (source ${want}, translation ${got})`)
}

async function translateOne(rel) {
  const srcPath = join(PAGES, SOURCE, rel)
  const sha = blobSha(srcPath)
  const source = readFileSync(srcPath, 'utf8')

  let body = (
    await complete({
      model: TRANSLATE_MODEL,
      system: SYSTEM,
      user: `Translate this MDX file:\n\n${source}`,
      maxTokens: MAX_OUTPUT_TOKENS,
    })
  ).trim()

  // Optional second pass: a (usually stronger) model corrects the draft.
  if (REVIEW_MODEL) {
    body = (
      await complete({
        model: REVIEW_MODEL,
        system: REVIEW_SYSTEM,
        user: `English source MDX:\n\n${source}\n\n---\n\nDraft translation to review and correct:\n\n${body}`,
        maxTokens: MAX_OUTPUT_TOKENS,
      })
    ).trim()
  }

  validateStructure(rel, source, body)

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
