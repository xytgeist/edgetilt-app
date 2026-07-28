/**
 * Invoke Edge publish-call-egress-template (mirrors Vercel → R2).
 *   node scripts/publish-call-egress-template.mjs --target=test
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

const sourceOrigin = target === 'production' ? 'https://edgetilt.com' : 'https://lvslotpro.com'
const endpoint = `${url}/functions/v1/publish-call-egress-template`
console.log('POST', endpoint, 'source_origin=', sourceOrigin)

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ source_origin: sourceOrigin }),
})
const text = await res.text()
console.log(res.status, text)
if (!res.ok) process.exit(1)
