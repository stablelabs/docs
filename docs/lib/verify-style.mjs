/**
 * Styleguide lint for the en source pages.
 *
 * Enforces the mechanical styleguide rules on every `en/**​/*.mdx` page. `en` is
 * the source of truth, so the generated `cn`/`ko` trees are NOT checked
 * (translation may legitimately differ in punctuation and wording).
 *
 * The enforced rules live in the `RULES` block below — the single source of
 * truth. STYLEGUIDE.md is the human narrative and links here rather than
 * restating values. Print the current rules with:
 *   npm run style:check -- --rules
 *
 * The checker is Vocs-aware: it ignores directive markers (`:::note`,
 * `:::code-group`, `::::steps`, `:badge[...]`) and treats the first token after a
 * code fence as the language, allowing trailing meta (`ts twoslash`, `bash [x]`,
 * `ts filename="y"`).
 *
 * Run from the repo root:
 *   npm run style:check            # check pages
 *   npm run style:check -- --rules # print the enforced rules
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const PAGES = 'docs/pages'
const SOURCE = 'en'

// ─────────────────────────────────────────────────────────────────────────────
// RULES — the single source of truth for the mechanically-enforced styleguide.
//
// To change what CI enforces, edit THIS block. STYLEGUIDE.md does not restate
// these values; it links here. Print the current rules with:
//   npm run style:check -- --rules
// ─────────────────────────────────────────────────────────────────────────────
const RULES = {
  // Valid `diataxis` frontmatter values; a page must also live in the matching
  // folder (e.g. a `how-to` page under `how-to/`).
  diataxis: ['tutorial', 'how-to', 'reference', 'explanation'],
  // Folders that hold pages but are not Diataxis types (skip the folder match).
  exemptFolders: ['resources'],
  // Max length (chars) of the frontmatter `description`.
  maxDescription: 160,
  // Marketing adjectives with no technical meaning — advisory warnings only.
  marketingWords: [
    'comprehensive', 'robust', 'meticulously', 'powerful', 'seamless',
    'seamlessly', 'cutting-edge', 'world-class', 'unparalleled', 'revolutionary',
    'game-changing', 'state-of-the-art', 'best-in-class', 'effortless',
  ],
}

// `--rules`: print the enforced rules and exit (so docs/contributors can read
// the source of truth instead of a copy that drifts).
if (process.argv.includes('--rules')) {
  console.log(`Styleguide rules enforced by docs/lib/verify-style.mjs:

Blocking (fail CI):
  - frontmatter present: title, description, diataxis
  - diataxis is one of: ${RULES.diataxis.join(' | ')}
  - page folder matches its diataxis (exempt: ${RULES.exemptFolders.join(', ')})
  - description ≤ ${RULES.maxDescription} characters
  - every fenced code block declares a language
  - no em dash (—) in prose

Warnings (advisory):
  - marketing words: ${RULES.marketingWords.join(', ')}`)
  process.exit(0)
}

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
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return fm
}

/** Strip the frontmatter block from the page body. */
function body(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

/**
 * Split a body into prose lines and fenced code blocks. Returns `prose` (the
 * body with code-block interiors removed) and `fences` (the opening fence info
 * strings, e.g. `ts twoslash`). Vocs `:::code-group` wrappers are directives, not
 * fences, so their inner ``` fences are still seen here.
 */
function partition(text, offset = 0) {
  const lines = text.split('\n')
  const proseLines = []
  const fences = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (!inFence) {
        inFence = true
        // 1-based line number in the original file.
        fences.push({ info: fence[3].trim(), line: offset + i + 1 })
      } else {
        inFence = false
      }
      continue
    }
    // Keep prose lines paired with their original 1-based line number so
    // findings can be anchored to an exact line.
    if (!inFence) proseLines.push({ text: line, line: offset + i + 1 })
  }
  return { proseLines, prose: proseLines.map((l) => l.text).join('\n'), fences }
}

const enRoot = join(PAGES, SOURCE)
const files = walk(enRoot).sort()

let blocking = 0
let warnings = 0
const issues = []
// Applyable fixes for rules with a safe mechanical correction. CI turns these
// into inline GitHub "suggested changes" on lines that are part of the PR diff.
const suggestions = []

for (const file of files) {
  const rel = relative(enRoot, file)
  const parts = rel.split('/')
  // Root-level pages (e.g. en/index.mdx) have no folder to match against.
  const topFolder = parts.length > 1 ? parts[0] : null
  const text = readFileSync(file, 'utf8')
  const fm = frontmatter(text)
  // Offset = lines consumed by the stripped frontmatter block, so prose/fence
  // line numbers map back to the original file.
  const fmMatch = text.match(/^---\n[\s\S]*?\n---\n?/)
  const offset = fmMatch ? fmMatch[0].split('\n').length - 1 : 0
  const { proseLines, prose, fences } = partition(body(text), offset)

  const err = (msg, line) => { blocking++; issues.push({ rel, level: '✗', msg, line }) }
  const warn = (msg, line) => { warnings++; issues.push({ rel, level: '⚠', msg, line }) }
  // First prose line (1-based, original file) matching a regex, or undefined.
  const proseLine = (re) => proseLines.find((l) => re.test(l.text))?.line

  // Frontmatter presence.
  if (!fm.title) err('missing frontmatter: title')
  if (!fm.description) err('missing frontmatter: description')
  if (!fm.diataxis) err('missing frontmatter: diataxis')

  // Diataxis value + folder match.
  if (fm.diataxis && !RULES.diataxis.includes(fm.diataxis)) {
    err(`invalid diataxis "${fm.diataxis}" (expected one of ${RULES.diataxis.join(', ')})`)
  } else if (fm.diataxis && topFolder && !RULES.exemptFolders.includes(topFolder) && topFolder !== fm.diataxis) {
    err(`diataxis "${fm.diataxis}" but file is under "${topFolder}/" (move it to "${fm.diataxis}/")`)
  }

  // Description length.
  if (fm.description && fm.description.length > RULES.maxDescription) {
    err(`description is ${fm.description.length} chars (max ${RULES.maxDescription})`)
  }

  // Code fences must declare a language (first token of the info string).
  for (const { info, line } of fences) {
    const lang = info.split(/[\s[]/)[0]
    if (!lang) err('code block has no language tag', line)
  }

  // Em dashes in prose only.
  if (prose.includes('—')) {
    const n = (prose.match(/—/g) || []).length
    err(`${n} em dash${n > 1 ? 'es' : ''} in prose (use a colon, comma, or two sentences)`, proseLine(/—/))
    // Offer a colon replacement per offending line. The colon is the
    // styleguide's first-listed fix; the author can edit before committing.
    for (const l of proseLines) {
      if (!l.text.includes('—')) continue
      const fixed = l.text.replace(/\s*—\s*/g, ': ')
      if (fixed !== l.text) {
        suggestions.push({ rel, line: l.line, fixed, reason: 'Replace the em dash with a colon (or edit to a comma / two sentences).' })
      }
    }
  }

  // Marketing adjectives (advisory).
  for (const word of RULES.marketingWords) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    if (re.test(prose)) warn(`marketing word "${word}"`, proseLine(re))
  }
}

for (const { rel, level, msg, line } of issues) {
  console.log(`  ${level} ${rel}${line ? `:${line}` : ''}: ${msg}`)
}

const summary =
  `${blocking === 0 ? '✓' : '✗'} ${files.length} en pages — ` +
  `${blocking} blocking, ${warnings} warning${warnings === 1 ? '' : 's'}`

console.log(`\n${summary}`)

// Optional Markdown report for CI to post as a PR comment. Writing it never
// changes the exit code — blocking issues still fail the job.
if (process.env.STYLE_REPORT) {
  writeFileSync(process.env.STYLE_REPORT, renderReport())
}

// Optional JSON of applyable fixes for CI to post as inline suggestions.
if (process.env.STYLE_SUGGESTIONS) {
  writeFileSync(process.env.STYLE_SUGGESTIONS, JSON.stringify(suggestions, null, 2))
}

function renderReport() {
  // STYLE_REPO_URL is the blob base for the PR head commit, e.g.
  // https://github.com/owner/repo/blob/<sha>. When set, file paths become
  // clickable links (with #L line anchors); otherwise they stay plain text.
  const base = process.env.STYLE_REPO_URL?.replace(/\/$/, '')
  const fileUrl = (rel, line) =>
    base ? `${base}/docs/pages/en/${rel}${line ? `#L${line}` : ''}` : null

  const lines = ['## Styleguide check', '', `**${summary}**`, '']
  if (issues.length === 0) {
    lines.push('No styleguide issues found. ✨')
    return lines.join('\n')
  }
  // Group issues by file, preserving discovery order.
  const byFile = new Map()
  for (const it of issues) {
    if (!byFile.has(it.rel)) byFile.set(it.rel, [])
    byFile.get(it.rel).push(it)
  }
  if (blocking > 0) {
    lines.push('Blocking issues must be fixed before merge; warnings are advisory.', '')
  }
  for (const [rel, list] of byFile) {
    const url = fileUrl(rel)
    lines.push(url ? `### [docs/pages/en/${rel}](${url})` : `### \`docs/pages/en/${rel}\``)
    for (const { level, msg, line } of list) {
      const label = level === '✗' ? '**✗ blocking**' : '⚠ warning'
      const loc = line
        ? base
          ? ` ([L${line}](${fileUrl(rel, line)}))`
          : ` (line ${line})`
        : ''
      lines.push(`- ${label}: ${msg}${loc}`)
    }
    lines.push('')
  }
  const guide = base
    ? `[STYLEGUIDE.md](${base}/STYLEGUIDE.md)`
    : '[STYLEGUIDE.md](../blob/HEAD/STYLEGUIDE.md)'
  lines.push(`<sub>Enforced by \`npm run style:check\` — see ${guide}.</sub>`)
  return lines.join('\n')
}

process.exit(blocking === 0 ? 0 : 1)
