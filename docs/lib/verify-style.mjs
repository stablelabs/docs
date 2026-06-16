/**
 * Styleguide lint for the en source pages.
 *
 * Enforces the mechanical rules in `STYLEGUIDE.md` on every `en/**​/*.mdx` page.
 * `en` is the source of truth, so the generated `cn`/`ko` trees are NOT checked
 * (translation may legitimately differ in punctuation and wording).
 *
 * Blocking (non-zero exit):
 *   - Missing/empty `title`, `description`, or `diataxis` frontmatter.
 *   - `diataxis` not one of tutorial | how-to | reference | explanation.
 *   - Folder does not match `diataxis` (a `how-to` page must live in `how-to/`).
 *     Pages under `resources/` are exempt from the folder match.
 *   - `description` longer than 160 characters.
 *   - A fenced code block with no language tag.
 *   - An em dash (—) in prose (code-block interiors are exempt).
 *
 * Warnings (advisory, do not block):
 *   - Marketing adjectives with no technical meaning.
 *
 * The checker is Vocs-aware: it ignores directive markers (`:::note`,
 * `:::code-group`, `::::steps`, `:badge[...]`) and treats the first token after a
 * code fence as the language, allowing trailing meta (`ts twoslash`, `bash [x]`,
 * `ts filename="y"`).
 *
 * Run from the repo root:
 *   npm run style:check
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const PAGES = 'docs/pages'
const SOURCE = 'en'
const DIATAXIS = ['tutorial', 'how-to', 'reference', 'explanation']
// Folders that hold pages but are not Diataxis types (no folder/diataxis match).
const EXEMPT_FOLDERS = ['resources']
const MAX_DESCRIPTION = 160
const MARKETING_WORDS = [
  'comprehensive', 'robust', 'meticulously', 'powerful', 'seamless',
  'seamlessly', 'cutting-edge', 'world-class', 'unparalleled', 'revolutionary',
  'game-changing', 'state-of-the-art', 'best-in-class', 'effortless',
]

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
function partition(text) {
  const lines = text.split('\n')
  const proseLines = []
  const fences = []
  let inFence = false
  for (const line of lines) {
    const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (!inFence) {
        inFence = true
        fences.push(fence[3].trim())
      } else {
        inFence = false
      }
      continue
    }
    if (!inFence) proseLines.push(line)
  }
  return { prose: proseLines.join('\n'), fences }
}

const enRoot = join(PAGES, SOURCE)
const files = walk(enRoot).sort()

let blocking = 0
let warnings = 0
const issues = []

for (const file of files) {
  const rel = relative(enRoot, file)
  const parts = rel.split('/')
  // Root-level pages (e.g. en/index.mdx) have no folder to match against.
  const topFolder = parts.length > 1 ? parts[0] : null
  const text = readFileSync(file, 'utf8')
  const fm = frontmatter(text)
  const { prose, fences } = partition(body(text))

  const err = (msg) => { blocking++; issues.push({ rel, level: '✗', msg }) }
  const warn = (msg) => { warnings++; issues.push({ rel, level: '⚠', msg }) }

  // Frontmatter presence.
  if (!fm.title) err('missing frontmatter: title')
  if (!fm.description) err('missing frontmatter: description')
  if (!fm.diataxis) err('missing frontmatter: diataxis')

  // Diataxis value + folder match.
  if (fm.diataxis && !DIATAXIS.includes(fm.diataxis)) {
    err(`invalid diataxis "${fm.diataxis}" (expected one of ${DIATAXIS.join(', ')})`)
  } else if (fm.diataxis && topFolder && !EXEMPT_FOLDERS.includes(topFolder) && topFolder !== fm.diataxis) {
    err(`diataxis "${fm.diataxis}" but file is under "${topFolder}/" (move it to "${fm.diataxis}/")`)
  }

  // Description length.
  if (fm.description && fm.description.length > MAX_DESCRIPTION) {
    err(`description is ${fm.description.length} chars (max ${MAX_DESCRIPTION})`)
  }

  // Code fences must declare a language (first token of the info string).
  for (const info of fences) {
    const lang = info.split(/[\s[]/)[0]
    if (!lang) err('code block has no language tag')
  }

  // Em dashes in prose only.
  if (prose.includes('—')) {
    const n = (prose.match(/—/g) || []).length
    err(`${n} em dash${n > 1 ? 'es' : ''} in prose (use a colon, comma, or two sentences)`)
  }

  // Marketing adjectives (advisory).
  for (const word of MARKETING_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    if (re.test(prose)) warn(`marketing word "${word}"`)
  }
}

for (const { rel, level, msg } of issues) {
  console.log(`  ${level} ${rel}: ${msg}`)
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

function renderReport() {
  const lines = ['## Styleguide check', '', `**${summary}**`, '']
  if (issues.length === 0) {
    lines.push('No styleguide issues found. ✨')
    return lines.join('\n')
  }
  // Group issues by file, blocking errors first within each group.
  const byFile = new Map()
  for (const it of issues) {
    if (!byFile.has(it.rel)) byFile.set(it.rel, [])
    byFile.get(it.rel).push(it)
  }
  if (blocking > 0) {
    lines.push('Blocking issues must be fixed before merge; warnings are advisory.', '')
  }
  for (const [rel, list] of byFile) {
    lines.push(`### \`docs/pages/en/${rel}\``)
    for (const { level, msg } of list) {
      lines.push(`- ${level === '✗' ? '**✗ blocking**' : '⚠ warning'}: ${msg}`)
    }
    lines.push('')
  }
  lines.push('<sub>Enforced by `npm run style:check` — see [STYLEGUIDE.md](../blob/HEAD/STYLEGUIDE.md).</sub>')
  return lines.join('\n')
}

process.exit(blocking === 0 ? 0 : 1)
