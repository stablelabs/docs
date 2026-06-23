/**
 * i18n parity + staleness check.
 *
 * `en` is the source of truth. Every `en/**​/*.mdx` page must have a same-path
 * counterpart in each target locale (`cn`, `ko`). Each translated page records
 * the `en` revision it was translated from via frontmatter:
 *
 *   ---
 *   source_path: explanation/consensus.mdx
 *   source_sha: a1b2c3d        # `git hash-object` of the en file at that time
 *   ---
 *
 * Rules:
 *   - Missing translation file            -> BLOCKING (non-zero exit).
 *   - Translation exists but source_sha   -> WARN (stale, does not block).
 *     differs from current en hash
 *   - Translation exists, no source_sha   -> WARN (untracked).
 *
 * `i18n-allowlist.json` lists en paths intentionally left untranslated (e.g.
 * pending orphan decisions); those are skipped by the parity check.
 *
 * Run from the repo root:
 *   npm run i18n:check          # missing translations block; stale warns
 *   npm run i18n:check:strict   # missing or stale translations block
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const PAGES = 'docs/pages'
const SOURCE = 'en'
const TARGETS = ['cn', 'ko']
const ALLOWLIST_PATH = 'docs/i18n-allowlist.json'
const strict = process.argv.includes('--strict')

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.mdx')) out.push(p)
  }
  return out
}

/** Parse the `key: value` pairs from a leading `---` frontmatter block. */
function frontmatter(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return fm
}

/** git blob sha of a file's *current working-tree contents*. */
function blobSha(file) {
  return execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim()
}

const allowlist = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')).untranslated ?? []
  : []

const enFiles = walk(join(PAGES, SOURCE))
  .map((p) => relative(join(PAGES, SOURCE), p))
  .sort()

let missing = 0
let stale = 0
const missingByLocale = {}
const staleByLocale = {}

for (const locale of TARGETS) {
  missingByLocale[locale] = []
  staleByLocale[locale] = []
  for (const rel of enFiles) {
    if (allowlist.includes(rel)) continue
    const target = join(PAGES, locale, rel)
    if (!existsSync(target)) {
      missing++
      missingByLocale[locale].push(rel)
      continue
    }
    const fm = frontmatter(target)
    const currentSha = blobSha(join(PAGES, SOURCE, rel))
    if (!fm.source_sha) {
      stale++
      staleByLocale[locale].push(`${rel} (untracked: no source_sha)`)
    } else if (fm.source_sha !== currentSha) {
      stale++
      staleByLocale[locale].push(
        `${rel} (was ${fm.source_sha.slice(0, 7)}, now ${currentSha.slice(0, 7)})`,
      )
    }
  }
}

for (const locale of TARGETS) {
  console.log(`\n## ${locale}`)
  console.log(`  missing (blocking): ${missingByLocale[locale].length}`)
  for (const f of missingByLocale[locale]) console.log(`    ✗ ${f}`)
  console.log(`  stale (${strict ? 'blocking' : 'warn'}): ${staleByLocale[locale].length}`)
  for (const f of staleByLocale[locale]) console.log(`    ⚠ ${f}`)
}

console.log(
  `\n${missing === 0 ? '✓' : '✗'} ${enFiles.length} en pages × ${TARGETS.length} locales — ` +
    `${missing} missing, ${stale} stale${allowlist.length ? `, ${allowlist.length} allowlisted` : ''}`,
)

// Missing translations always block; stale translations block only in strict mode.
process.exit(missing === 0 && (!strict || stale === 0) ? 0 : 1)
