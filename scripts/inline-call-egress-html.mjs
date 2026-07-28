/**
 * After vite.call-egress build: inline JS into dist/call-egress.html
 * so LiveKit Chrome has zero extra module fetches / CORS surface.
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
  console.error('No module script tag found in dist/call-egress.html')
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

const js = fs.readFileSync(abs, 'utf8')
const inlined = `<script type="module">\n${js}\n</script>`
html = html.replace(scriptRe, inlined)
// Drop stylesheet link if any (styles are already in <style> in source HTML).
html = html.replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
fs.writeFileSync(htmlPath, html)
console.log('Inlined', path.basename(abs), 'into dist/call-egress.html (' + html.length + ' bytes)')
