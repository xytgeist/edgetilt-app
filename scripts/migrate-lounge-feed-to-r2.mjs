/**
 * Invoke Edge `lounge-cf-r2-migrate-lounge-feed` (legacy Supabase lounge-feed → R2).
 *
 * Requires `.env.supabase.test` (or `.env.supabase.production` with --target=production):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 *   node scripts/migrate-lounge-feed-to-r2.mjs --target=test --dry-run
 *   node scripts/migrate-lounge-feed-to-r2.mjs --target=test
 *   node scripts/migrate-lounge-feed-to-r2.mjs --target=test --keep-old
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function parseEnvLine(line) {
  let s = line.trim()
  if (!s || s.startsWith('#')) return null
  if (s.startsWith('export ')) s = s.slice(7).trim()
  const eq = s.indexOf('=')
  if (eq <= 0) return null
  const key = s.slice(0, eq).trim()
  let val = s.slice(eq + 1).trim()
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1)
  }
  return { key, val }
}

function applyEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return false
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const parsed = parseEnvLine(line)
    if (parsed) process.env[parsed.key] = parsed.val
  }
  return true
}

const args = process.argv.slice(2)
const target = args.includes('--target=production')
  ? 'production'
  : args.includes('--target=test')
    ? 'test'
    : 'test'
const dryRun = args.includes('--dry-run')
const keepOld = args.includes('--keep-old')

applyEnvFile(path.join(repoRoot, '.env'))
const targetFile = target === 'production' ? '.env.supabase.production' : '.env.supabase.test'
if (!applyEnvFile(path.join(repoRoot, targetFile))) {
  console.error(`Missing ${targetFile}`)
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.')
  process.exit(1)
}

const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/lounge-cf-r2-migrate-lounge-feed`
const body = { dryRun, deleteOld: !keepOld && !dryRun }

console.log(`Target: ${target}`)
console.log(`POST ${endpoint}`)
console.log(`Body: ${JSON.stringify(body)}`)

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  console.error(res.status, text)
  process.exit(1)
}

console.log(JSON.stringify(json, null, 2))
if (!res.ok) process.exit(1)
