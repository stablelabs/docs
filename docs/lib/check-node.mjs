/**
 * Fail fast when the active Node runtime is too old for Vocs.
 *
 * Vocs 1.4.x uses Node APIs that are only available in Node 22+, so a clearer
 * preflight error is more useful than a later build-time module failure.
 */

const major = Number(process.versions.node.split('.')[0])

if (major < 22) {
  console.error(
    `Node ${process.versions.node} is active, but this repo requires Node 22+.\n` +
      'Run `nvm use` from the repo root, or install Node 22 and try again.',
  )
  process.exit(1)
}

console.log(`Node ${process.versions.node} OK`)
