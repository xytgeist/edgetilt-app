/**
 * Two-layer cache for Edge Functions: per-isolate memory in front of `public.edge_shared_cache`.
 * Supabase runs many isolates of a busy function in parallel, so memory alone means one upstream
 * fetch per isolate per TTL. The shared row makes it one fetch per TTL for the whole project:
 * one isolate wins the rebuild lease, the rest serve the last payload (or wait briefly on a cold key).
 * Any DB failure falls back to building locally so the cache can never take a surface down.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

type SharedCacheOpts<T> = {
  ttlMs: number
  /** How long a rebuild may hold the lease before another isolate can take over. */
  leaseMs?: number
  /** Oldest payload served while another isolate rebuilds. */
  staleMaxMs?: number
  /** Skip the shared write (e.g. empty/failed upstream) so the next caller retries. */
  shouldStore?: (value: T) => boolean
  admin?: SupabaseClient | null
}

type MemEntry = { at: number; promise: Promise<unknown> }

const mem = new Map<string, MemEntry>()
let serviceClient: SupabaseClient | null = null

function sharedClient(admin?: SupabaseClient | null): SupabaseClient | null {
  if (admin) return admin
  if (serviceClient) return serviceClient
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  serviceClient = createClient(url, key, { auth: { persistSession: false } })
  return serviceClient
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Row = { payload: unknown; fetched_at: string | null }

async function readRow(db: SupabaseClient, key: string): Promise<Row | null> {
  const { data, error } = await db
    .from('edge_shared_cache')
    .select('payload, fetched_at')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  return (data as Row | null) ?? null
}

function rowAge(row: Row | null): number {
  if (!row?.fetched_at || row.payload == null) return Infinity
  const age = Date.now() - Date.parse(row.fetched_at)
  return Number.isFinite(age) && age >= 0 ? age : Infinity
}

async function resolveShared<T>(
  key: string,
  opts: SharedCacheOpts<T>,
  build: () => Promise<T>,
  setMemAt: (at: number) => void,
): Promise<T> {
  const db = sharedClient(opts.admin)
  if (!db) return build()
  const ttlMs = opts.ttlMs
  const leaseMs = opts.leaseMs ?? Math.max(10_000, ttlMs * 2)
  const staleMaxMs = opts.staleMaxMs ?? Math.max(60_000, ttlMs * 6)

  let row: Row | null
  try {
    row = await readRow(db, key)
  } catch {
    return build()
  }
  const age = rowAge(row)
  if (age < ttlMs) {
    setMemAt(Date.now() - age)
    return row!.payload as T
  }

  let claimed = false
  try {
    const { data, error } = await db.rpc('edge_shared_cache_claim', { p_key: key, p_lease_ms: leaseMs })
    if (error) return build()
    claimed = data === true
  } catch {
    return build()
  }

  if (claimed) {
    let value: T
    try {
      value = await build()
    } catch (err) {
      await db.from('edge_shared_cache').update({ lease_until: null }).eq('key', key).then(() => null, () => null)
      throw err
    }
    const store = value != null && (opts.shouldStore ? opts.shouldStore(value) : true)
    const patch = store
      ? { payload: value, fetched_at: new Date().toISOString(), lease_until: null }
      : { lease_until: null }
    await db.from('edge_shared_cache').update(patch).eq('key', key).then(() => null, () => null)
    return value
  }

  if (age < staleMaxMs) {
    // Recheck soon: the lease holder should land a fresh row within a second or two.
    setMemAt(Date.now() - ttlMs + Math.min(1_500, ttlMs))
    return row!.payload as T
  }

  const waitUntil = Date.now() + Math.min(leaseMs, 8_000)
  while (Date.now() < waitUntil) {
    await sleep(300)
    try {
      const next = await readRow(db, key)
      const nextAge = rowAge(next)
      if (nextAge < ttlMs) {
        setMemAt(Date.now() - nextAge)
        return next!.payload as T
      }
    } catch {
      break
    }
  }
  return build()
}

/** Shared layer only, for callers that keep their own memory cache (e.g. variable TTLs). */
export function sharedCachedNoMem<T>(key: string, opts: SharedCacheOpts<T>, build: () => Promise<T>): Promise<T> {
  return resolveShared(key, opts, build, () => {})
}

export function sharedCached<T>(key: string, opts: SharedCacheOpts<T>, build: () => Promise<T>): Promise<T> {
  const hit = mem.get(key)
  if (hit && Date.now() - hit.at < opts.ttlMs) return hit.promise as Promise<T>
  if (mem.size > 500) {
    for (const [k, v] of mem) if (Date.now() - v.at >= opts.ttlMs * 4) mem.delete(k)
  }
  const entry: MemEntry = { at: Date.now(), promise: Promise.resolve() }
  const promise = resolveShared(key, opts, build, (at) => {
    entry.at = at
  })
  entry.promise = promise
  mem.set(key, entry)
  promise.catch(() => {
    if (mem.get(key) === entry) mem.delete(key)
  })
  return promise
}
