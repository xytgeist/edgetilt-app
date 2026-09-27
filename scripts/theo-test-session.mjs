#!/usr/bin/env node
/**
 * Theo's agent test account (@theo_ops on the TEST Supabase project only).
 *
 *   node scripts/theo-test-session.mjs                       → prints a short-lived access token
 *   node scripts/theo-test-session.mjs --invoke <fn> [json]  → calls an Edge Function as Theo, prints JSON
 *
 * Reads THEO_TEST_EMAIL / THEO_TEST_PASSWORD + VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from `.env.local`.
 * Refuses to run against anything but the test project (`kcosfvmreeiosdjdzycb`).
 */
import fs from 'node:fs'
import path from 'node:path'

const TEST_REF = 'kcosfvmreeiosdjdzycb'

function readEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

const env = { ...readEnv(path.resolve('.env.local')), ...process.env }
const url = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY
const email = env.THEO_TEST_EMAIL
const password = env.THEO_TEST_PASSWORD

if (!url.includes(TEST_REF)) {
  console.error(`Refusing: VITE_SUPABASE_URL is not the test project (${TEST_REF}).`)
  process.exit(1)
}
if (!anon || !email || !password) {
  console.error('Missing VITE_SUPABASE_ANON_KEY / THEO_TEST_EMAIL / THEO_TEST_PASSWORD in .env.local.')
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

const args = process.argv.slice(2)
const invokeAt = args.indexOf('--invoke')
if (invokeAt === -1) {
  process.stdout.write(`${session.access_token}\n`)
} else {
  await invoke(args[invokeAt + 1], args[invokeAt + 2] || '{}')
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
