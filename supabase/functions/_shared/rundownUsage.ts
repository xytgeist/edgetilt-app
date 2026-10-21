/**
 * TheRundown account usage, read from the `x-datapoints-*` headers every billed response carries.
 * One row per UTC day in `edge_shared_cache` (`rundown:usage:YYYY-MM-DD`): the first and latest `used`
 * counter seen that day, so the day's spend is `last_used - first_used`. Emails ops once per day when that
 * spend passes RUNDOWN_DAILY_ALERT_POINTS (default 800k ≈ a 24M month, under the 25M Starter plan) or the
 * period's remaining points drop under 10% of the limit.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sendOpsAlertEmail } from './billingAdminAlert.ts'

const WRITE_EVERY_MS = 5 * 60_000
const DEFAULT_DAILY_ALERT = 800_000

type UsageRow = {
  first_used: number
  last_used: number
  limit: number | null
  remaining: number | null
  reset: string | null
  first_at: string
  last_at: string
  alerted_spike?: boolean
  alerted_low?: boolean
}

let lastWriteAt = 0
let client: SupabaseClient | null = null

function db(): SupabaseClient | null {
  if (client) return client
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

function int(value: string | null): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

function dailyAlertPoints(): number {
  const n = Number(Deno.env.get('RUNDOWN_DAILY_ALERT_POINTS'))
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_ALERT
}

async function record(headers: Headers): Promise<void> {
  const used = int(headers.get('x-datapoints-used'))
  if (used == null) return
  const admin = db()
  if (!admin) return
  const limit = int(headers.get('x-datapoints-limit'))
  const remaining = int(headers.get('x-datapoints-remaining'))
  const reset = headers.get('x-datapoints-reset') || null
  const now = new Date().toISOString()
  const key = `rundown:usage:${now.slice(0, 10)}`

  const { data } = await admin.from('edge_shared_cache').select('payload').eq('key', key).maybeSingle()
  const prev = (data?.payload || null) as UsageRow | null
  // A lower counter than the day's first read means the billing period reset mid-day.
  const row: UsageRow = prev && used >= prev.first_used
    ? { ...prev, last_used: Math.max(prev.last_used, used), limit, remaining, reset, last_at: now }
    : { first_used: used, last_used: used, limit, remaining, reset, first_at: now, last_at: now }

  const spent = row.last_used - row.first_used
  const threshold = dailyAlertPoints()
  const alerts: string[] = []
  if (!row.alerted_spike && spent >= threshold) {
    row.alerted_spike = true
    alerts.push(`Spent ${spent.toLocaleString('en-US')} points today (UTC), over the ${threshold.toLocaleString('en-US')} daily alert.`)
  }
  if (!row.alerted_low && limit && remaining != null && remaining < limit * 0.1) {
    row.alerted_low = true
    alerts.push(`Only ${remaining.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} points left until ${reset || 'the period reset'}.`)
  }

  await admin.from('edge_shared_cache').upsert({ key, payload: row, fetched_at: now }, { onConflict: 'key' })
  if (alerts.length) {
    await sendOpsAlertEmail(`[EdgeTilt] TheRundown usage alert`, [
      ...alerts,
      '',
      `Used this period: ${row.last_used.toLocaleString('en-US')}${limit ? ` of ${limit.toLocaleString('en-US')}` : ''}`,
      `Today so far: ${spent.toLocaleString('en-US')} (since ${row.first_at})`,
      '',
      'Per-request costs are in the TheRundown dashboard request log. Callers: lounge-sports-scoreboard (shop books, hub live state), lounge-odds-poll (bot context), fantasy-lineup-cards (player props).',
    ])
  }
}

/** Fire-and-forget usage note for a billed TheRundown response. At most one DB write per isolate per 5 min. */
export function noteRundownUsage(headers: Headers): void {
  if (Date.now() - lastWriteAt < WRITE_EVERY_MS) return
  if (!headers.get('x-datapoints-used')) return
  lastWriteAt = Date.now()
  const run = record(headers).catch((err) => {
    console.warn('[rundown] usage note failed:', err instanceof Error ? err.message : String(err))
  })
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(run)
}
