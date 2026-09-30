#!/usr/bin/env node
/**
 * Stripe support helper (live). Uses the restricted key STRIPE_SUPPORT_KEY_LIVE from .env.local
 * (Customers/Invoices/Charges/Events/Portal/Checkout read, Subscriptions write).
 *
 * Reads are safe anytime. cancel / resume change a real customer's billing: only run them when
 * Ryan names the customer and the action.
 *
 *   node scripts/stripe-support.mjs lookup <email | cus_...>
 *   node scripts/stripe-support.mjs events <cus_...>          recent events incl. billing portal sessions
 *   node scripts/stripe-support.mjs cancel <sub_...>          cancel at period end (keeps access)
 *   node scripts/stripe-support.mjs resume <sub_...>          undo a scheduled cancel
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { repoRoot } from './lib/supabaseEnv.mjs'

function loadKey() {
  if (process.env.STRIPE_SUPPORT_KEY_LIVE) return process.env.STRIPE_SUPPORT_KEY_LIVE.trim()
  const text = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  const m = text.match(/^\s*STRIPE_SUPPORT_KEY_LIVE\s*=\s*(.+)\s*$/m)
  if (!m) throw new Error('STRIPE_SUPPORT_KEY_LIVE missing from .env.local')
  return m[1].trim().replace(/^['"]|['"]$/g, '')
}

const KEY = loadKey()

async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined
  const url = `https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(method !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method !== 'GET' ? body : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json?.error?.message || JSON.stringify(json)}`)
  return json
}

const day = (unix) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null)

function summarizeSub(s) {
  const item = s.items?.data?.[0]
  return {
    id: s.id,
    status: s.status,
    cancel_at_period_end: s.cancel_at_period_end,
    cancel_at: day(s.cancel_at),
    period_end: day(item?.current_period_end ?? s.current_period_end),
    price: item?.price
      ? `${(item.price.unit_amount ?? 0) / 100} ${item.price.currency} / ${item.price.recurring?.interval}`
      : null,
    product: item?.price?.product,
    created: day(s.created),
  }
}

async function lookup(arg) {
  const customers = arg.startsWith('cus_')
    ? [await stripe('GET', `/customers/${arg}`)]
    : (await stripe('GET', '/customers', { email: arg, limit: '10' })).data
  if (!customers.length) return console.log('No Stripe customer for', arg)
  for (const c of customers) {
    const subs = await stripe('GET', '/subscriptions', { customer: c.id, status: 'all', limit: '20' })
    const invoices = await stripe('GET', '/invoices', { customer: c.id, limit: '5' })
    console.log(
      JSON.stringify(
        {
          customer: c.id,
          email: c.email,
          name: c.name,
          created: day(c.created),
          subscriptions: subs.data.map(summarizeSub),
          recent_invoices: invoices.data.map((i) => ({
            id: i.id,
            status: i.status,
            amount_paid: i.amount_paid / 100,
            created: day(i.created),
          })),
        },
        null,
        2,
      ),
    )
  }
}

async function events(customerId) {
  const out = []
  for (const type of ['billing_portal.session.created', 'customer.subscription.updated', 'customer.subscription.deleted']) {
    const list = await stripe('GET', '/events', { type, limit: '100' })
    for (const e of list.data) {
      const obj = e.data?.object || {}
      if (obj.customer === customerId) {
        out.push({ type: e.type, at: new Date(e.created * 1000).toISOString(), id: e.id })
      }
    }
  }
  out.sort((a, b) => a.at.localeCompare(b.at))
  console.log(out.length ? JSON.stringify(out, null, 2) : `No portal/subscription events for ${customerId} (Stripe keeps events ~30 days).`)
}

async function setCancel(subId, cancel) {
  const s = await stripe('POST', `/subscriptions/${subId}`, { cancel_at_period_end: cancel ? 'true' : 'false' })
  console.log(JSON.stringify(summarizeSub(s), null, 2))
}

const [cmd, arg] = process.argv.slice(2)
const run = {
  lookup: () => lookup(arg),
  events: () => events(arg),
  cancel: () => setCancel(arg, true),
  resume: () => setCancel(arg, false),
}[cmd]

if (!run || !arg) {
  console.error('Usage: node scripts/stripe-support.mjs <lookup|events|cancel|resume> <arg>')
  process.exitCode = 1
} else {
  run().catch((err) => {
    console.error('[stripe-support]', err.message || err)
    process.exitCode = 1
  })
}
