/**
 * Backfill creator_subscriptions from Stripe when webhook processing failed.
 *
 * Usage:
 *   set STRIPE_SECRET_KEY=sk_live_...
 *   node scripts/sync-creator-fan-sub-from-stripe.mjs --target=production --customer=cus_xxx
 *   node scripts/sync-creator-fan-sub-from-stripe.mjs --target=production --subscription=sub_xxx
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, repoRoot } from './lib/supabaseEnv.mjs'

function parseArgs(argv) {
  let target = 'production'
  let customer = null
  let subscriptionId = null
  for (const arg of argv) {
    if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    if (arg.startsWith('--customer=')) customer = arg.slice('--customer='.length).trim()
    if (arg.startsWith('--subscription=')) subscriptionId = arg.slice('--subscription='.length).trim()
  }
  return { target, customer, subscriptionId }
}

function isFanMeta(meta) {
  if (!meta || typeof meta !== 'object') return false
  if (meta.billing_kind === 'creator_fan_sub') return true
  return Boolean(String(meta.creator_user_id || '').trim() && String(meta.subscriber_user_id || '').trim())
}

async function stripeGet(path, secretKey) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.error?.message || res.statusText)
  }
  return body
}

function subscriptionPayload(sub) {
  return {
    id: sub.id,
    customer: sub.customer,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: sub.current_period_end,
    metadata: sub.metadata || {},
  }
}

async function upsertFanSub(admin, sub) {
  const meta = sub.metadata || {}
  const subscriberUserId = String(meta.subscriber_user_id || '').trim()
  const creatorUserId = String(meta.creator_user_id || '').trim()
  const fanTierKey = String(meta.fan_tier_key || '').trim()
  if (!subscriberUserId || !creatorUserId || !fanTierKey) {
    throw new Error(`Subscription ${sub.id} missing fan metadata`)
  }
  if (sub.status !== 'active' && sub.status !== 'trialing') {
    console.log(`Skip ${sub.id} status=${sub.status}`)
    return
  }

  const periodEnd =
    typeof sub.current_period_end === 'number'
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null

  const row = {
    subscriber_user_id: subscriberUserId,
    creator_user_id: creatorUserId,
    fan_tier_key: fanTierKey,
    stripe_subscription_id: sub.id,
    stripe_customer_id: String(sub.customer),
    status: sub.status,
    current_period_end: periodEnd,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await admin
    .from('creator_subscriptions')
    .select('id, status')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()

  const { error } = await admin.from('creator_subscriptions').upsert(row, {
    onConflict: 'subscriber_user_id,creator_user_id',
  })
  if (error) throw new Error(`creator_subscriptions upsert: ${error.message}`)

  const { error: syncErr } = await admin.rpc('creator_fan_sub_sync_chat_member', {
    p_subscriber_user_id: subscriberUserId,
    p_creator_user_id: creatorUserId,
    p_grant_access: true,
  })
  if (syncErr) console.warn('creator_fan_sub_sync_chat_member:', syncErr.message)

  const wasActive =
    existing?.id != null && (existing.status === 'active' || existing.status === 'trialing')
  if (!wasActive) {
    const { error: notifyErr } = await admin.rpc('creator_fan_notify_new_subscriber', {
      p_creator_user_id: creatorUserId,
      p_subscriber_user_id: subscriberUserId,
    })
    if (notifyErr) console.warn('creator_fan_notify_new_subscriber:', notifyErr.message)
  }

  console.log(`Synced fan sub ${sub.id} → creator ${creatorUserId} ← subscriber ${subscriberUserId}`)
}

async function main() {
  const { target, customer, subscriptionId } = parseArgs(process.argv.slice(2))
  if (!customer && !subscriptionId) {
    console.error('Pass --customer=cus_xxx and/or --subscription=sub_xxx')
    process.exit(1)
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!stripeKey) {
    console.error('Set STRIPE_SECRET_KEY (live or test matching --target).')
    process.exit(1)
  }

  loadSupabaseEnv(target === 'test' ? 'test' : 'production')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`Missing Supabase env for ${target} (see ${repoRoot}/.env.supabase.example)`)
    process.exit(1)
  }

  const admin = createClient(url, key, { auth: { persistSession: false } })

  const subs = []
  if (subscriptionId) {
    const sub = await stripeGet(`/subscriptions/${encodeURIComponent(subscriptionId)}`, stripeKey)
    subs.push(sub)
  }
  if (customer) {
    const list = await stripeGet(
      `/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`,
      stripeKey,
    )
    for (const sub of list.data || []) subs.push(sub)
  }

  const fanSubs = subs.filter((s) => isFanMeta(s.metadata))
  if (fanSubs.length === 0) {
    console.log('No creator fan subscriptions found for that customer/subscription id.')
    process.exit(0)
  }

  for (const sub of fanSubs) {
    await upsertFanSub(admin, subscriptionPayload(sub))
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
