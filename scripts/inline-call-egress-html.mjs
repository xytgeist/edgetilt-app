/**
 * Prepare dist/call-egress.html for LiveKit:
 * - Keep JS as an external /assets/callEgress-*.js file (do NOT inline).
 *   Inlining broke the HTML parser (~29KB into the bundle) and painted raw JS on screen.
 * - Guarantee classic START_RECORDING is the first executable in <head>.
 * - Strip crossorigin from script/link tags (unnecessary same-origin friction).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const htmlPath = path.join(root, 'dist', 'call-egress.html')
if (!fs.existsSync(htmlPath)) {
  console.error('Missing dist/call-egress.html — run vite.call-egress build first')
  process.exit(1)
}

let html = fs.readFileSync(htmlPath, 'utf8')

const scriptRe = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/
const m = html.match(scriptRe)
if (!m) {
  console.error('No external module script tag found in dist/call-egress.html')
  process.exit(1)
}
const src = m[1]
const abs = src.startsWith('/')
  ? path.join(root, 'dist', src.replace(/^\//, ''))
  : path.join(path.dirname(htmlPath), src)
if (!fs.existsSync(abs)) {
  console.error('Missing JS asset:', abs)
  process.exit(1)
}

// Drop any Vite-injected crossorigin; keep external src.
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
  `<script type="module" src="$1"></script>`,
)
html = html.replace(/\s*crossorigin(?:="[^"]*")?/gi, '')
html = html.replace(/<link rel="stylesheet"[^>]*>\s*/g, '')

const startTag = `<script>\n      console.log('START_RECORDING')\n    </script>`
html = html.replace(/<script>\s*console\.log\(['"]START_RECORDING['"]\)\s*<\/script>/g, '')
html = html.replace(/<head([^>]*)>/i, `<head$1>\n    ${startTag}`)

fs.writeFileSync(htmlPath, html)
console.log(
  'Prepared',
  path.basename(htmlPath),
  'with external',
  path.basename(abs),
  '(' + html.length + ' html bytes, JS left external)',
)
