/**
 * Upload dist/call-egress.html (+ callEgress JS assets + logo) straight to R2 via Edge.
 *   node scripts/publish-call-egress-template-local.mjs --target=test
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    let s = line.trim()
    if (!s || s.startsWith('#')) continue
    if (s.startsWith('export ')) s = s.slice(7).trim()
    const eq = s.indexOf('=')
    if (eq <= 0) continue
    const key = s.slice(0, eq).trim()
    let val = s.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

const target = process.argv.includes('--target=production') ? 'production' : 'test'
loadEnv(path.join(repoRoot, '.env.local'))
loadEnv(path.join(repoRoot, target === 'production' ? '.env.supabase.production' : '.env.supabase.test'))

const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
if (!url || !key) {
  console.error('Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.supabase.' + target)
  process.exit(1)
}

const htmlPath = path.join(repoRoot, 'dist', 'call-egress.html')
if (!fs.existsSync(htmlPath)) {
  console.error(
    'Missing dist/call-egress.html — run: npx vite build --config vite.call-egress.config.js && node scripts/inline-call-egress-html.mjs',
  )
  process.exit(1)
}

let html = fs.readFileSync(htmlPath, 'utf8')
const assetRe = /(?:src|href)="(\/assets\/callEgress-[^"]+)"/g
const assetPaths = new Set()
let m
while ((m = assetRe.exec(html)) != null) assetPaths.add(m[1])
if (assetPaths.size === 0) {
  console.error('No /assets/callEgress-* references in dist/call-egress.html (did you inline by mistake?)')
  process.exit(1)
}

const assets = []
for (const assetPath of assetPaths) {
  const abs = path.join(repoRoot, 'dist', assetPath.replace(/^\//, ''))
  if (!fs.existsSync(abs)) {
    console.error('Missing asset', abs)
    process.exit(1)
  }
  assets.push({
    path: assetPath,
    fileName: path.basename(abs),
    content_base64: fs.readFileSync(abs).toString('base64'),
    content_type: abs.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'application/javascript; charset=utf-8',
  })
}

const logoCandidates = [
  path.join(repoRoot, 'dist', 'edge-lounge-logo-transparent.png'),
  path.join(repoRoot, 'public', 'edge-lounge-logo-transparent.png'),
  path.join(repoRoot, 'src', 'call-egress', 'edge-lounge-logo-transparent.png'),
]
const logoPath = logoCandidates.find((p) => fs.existsSync(p))
if (!logoPath) {
  console.error('Missing edge-lounge-logo-transparent.png')
  process.exit(1)
}

const endpoint = `${url}/functions/v1/publish-call-egress-template`
console.log(
  'POST',
  endpoint,
  'html_bytes=',
  html.length,
  'assets=',
  assets.map((a) => a.fileName).join(','),
)

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    html,
    assets,
    logo_base64: fs.readFileSync(logoPath).toString('base64'),
  }),
})
const text = await res.text()
console.log(res.status, text)
if (!res.ok) process.exit(1)
