#!/usr/bin/env node
/**
 * Theo's agent account (@theo_ops, separate users on test and production).
 *
 *   node scripts/theo-test-session.mjs                       → prints a short-lived access token (test)
 *   node scripts/theo-test-session.mjs --invoke <fn> [json]  → calls an Edge Function as Theo, prints JSON
 *   add --prod                                               → same against production (read-style calls only)
 *
 * Test: THEO_TEST_EMAIL / THEO_TEST_PASSWORD + VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * (`.env.master` or generated `.env.local`).
 * Prod: THEO_PROD_* + SUPABASE_URL from `.env.master` PROD_* or `.env.supabase.production`.
 * Each mode refuses any project but its own.
 */
import fs from 'node:fs'
import path from 'node:path'

const TEST_REF = 'kcosfvmreeiosdjdzycb'
const PROD_REF = 'jtjgtucumuoswnbauxry'

function readEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

const args = process.argv.slice(2)
const prod = args.includes('--prod')
const master = readEnv(path.resolve('.env.master'))
const env = { ...master, ...readEnv(path.resolve('.env.local')), ...process.env }
const prodEnv = prod
  ? { ...master, ...readEnv(path.resolve('.env.supabase.production')) }
  : {}
const url = String(
  (prod
    ? prodEnv.SUPABASE_URL || prodEnv.PROD_SUPABASE_URL
    : env.VITE_SUPABASE_URL || env.TEST_VITE_SUPABASE_URL || env.TEST_SUPABASE_URL) || '',
).replace(/\/$/, '')
const anon = prod
  ? env.THEO_PROD_ANON_KEY
  : env.VITE_SUPABASE_ANON_KEY || env.TEST_VITE_SUPABASE_ANON_KEY
const email = prod ? env.THEO_PROD_EMAIL : env.THEO_TEST_EMAIL
const password = prod ? env.THEO_PROD_PASSWORD : env.THEO_TEST_PASSWORD
const ref = prod ? PROD_REF : TEST_REF

if (!url.includes(ref)) {
  console.error(`Refusing: Supabase URL is not the ${prod ? 'production' : 'test'} project (${ref}).`)
  process.exit(1)
}
if (!anon || !email || !password) {
  console.error(`Missing ${prod ? 'THEO_PROD_*' : 'VITE_SUPABASE_ANON_KEY / THEO_TEST_*'} credentials in .env.master / .env.local.`)
  process.exit(1)
}

const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const session = await auth.json()
if (!auth.ok || !session.access_token) {
  console.error('Sign-in failed:', auth.status, session.error_description || session.msg || session.error || '')
  process.exit(1)
}

const positional = args.filter((a) => a !== '--prod')
const invokeAt = positional.indexOf('--invoke')
if (invokeAt === -1) {
  process.stdout.write(`${session.access_token}\n`)
} else {
  await invoke(positional[invokeAt + 1], positional[invokeAt + 2] || '{}')
}

// process.exit() would truncate large piped output … set the code and let stdout drain.
async function invoke(fn, body) {
  if (!fn) {
    console.error('Usage: --invoke <function-name> [json-body]')
    process.exitCode = 1
    return
  }
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
    body,
  })
  const text = await res.text()
  try {
    process.stdout.write(`${JSON.stringify(JSON.parse(text), null, 2)}\n`)
  } catch {
    process.stdout.write(`${text}\n`)
  }
  if (!res.ok) process.exitCode = 1
}
