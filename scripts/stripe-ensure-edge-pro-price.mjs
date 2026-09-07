/**
 * Invoke stripe-ensure-edge-pro-price on test (or --target=production).
 * Service role only. Prints price id / livemode. Does not print secrets.
 *
 *   node scripts/stripe-ensure-edge-pro-price.mjs
 *   node scripts/stripe-ensure-edge-pro-price.mjs --target=production
 */
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs'

const targetArg = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length)
  || (process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : null)
  || 'test'

if (targetArg !== 'test' && targetArg !== 'production') {
  console.error('--target must be test or production')
  process.exit(1)
}

loadSupabaseEnv(targetArg)
const url = process.env.SUPABASE_URL?.replace(/\/+$/, '')
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !service) {
  console.error(`Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for ${targetArg}`)
  process.exit(1)
}

const res = await fetch(`${url}/functions/v1/stripe-ensure-edge-pro-price`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${service}`,
    apikey: service,
    'Content-Type': 'application/json',
  },
  body: '{}',
})

const text = await res.text()
let body
try {
  body = JSON.parse(text)
} catch {
  console.error(`${targetArg}: HTTP ${res.status} non-JSON`)
  process.exit(1)
}

if (!res.ok) {
  console.error(`${targetArg}: HTTP ${res.status}`, body?.error || body)
  process.exit(1)
}

console.log(JSON.stringify({
  target: targetArg,
  ok: body.ok === true,
  livemode: body.livemode === true,
  created: body.created === true,
  priceId: body.priceId || null,
  configuredOk: body.configuredOk === true,
  needsSecretUpdate: body.configuredOk !== true && Boolean(body.priceId),
}, null, 2))
