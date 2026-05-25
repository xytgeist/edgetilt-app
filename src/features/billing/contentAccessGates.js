/** @typedef {'calculator'|'guide'} ContentAccessKind */

/**
 * @typedef {Object} ContentAccessGateRow
 * @property {ContentAccessKind} content_kind
 * @property {string} content_key
 * @property {boolean} requires_slots_edge
 */

/** @param {string | null | undefined} kind @param {string | null | undefined} key */
export function normalizeContentAccessKey(kind, key) {
  const k = String(key || '').trim().toLowerCase()
  if (!k) return ''
  if (kind === 'calculator') return k
  return k
}

/** @param {ContentAccessGateRow[] | null | undefined} rows */
export function contentAccessGatesMapFromRows(rows) {
  /** @type {Map<string, boolean>} */
  const map = new Map()
  for (const row of rows || []) {
    const kind = String(row?.content_kind || '').trim().toLowerCase()
    const key = normalizeContentAccessKey(kind, row?.content_key)
    if (!kind || !key) continue
    map.set(`${kind}:${key}`, Boolean(row.requires_slots_edge))
  }
  return map
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ rows: ContentAccessGateRow[], map: Map<string, boolean>, dbReady: boolean }>}
 */
export async function fetchContentAccessGates(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('content_access_gates')
    .select('content_kind, content_key, requires_slots_edge')

  if (error) {
    const missing =
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      error.message?.includes('content_access_gates')
    if (missing) {
      return { rows: [], map: new Map(), dbReady: false }
    }
    throw error
  }

  const rows = /** @type {ContentAccessGateRow[]} */ (data || [])
  return { rows, map: contentAccessGatesMapFromRows(rows), dbReady: true }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {ContentAccessKind} contentKind
 * @param {string} contentKey
 * @param {boolean} requiresSlotsEdge
 */
export async function upsertContentAccessGate(supabaseClient, contentKind, contentKey, requiresSlotsEdge) {
  const key = normalizeContentAccessKey(contentKind, contentKey)
  if (!key) throw new Error('Missing content key.')

  const { error } = await supabaseClient.from('content_access_gates').upsert(
    {
      content_kind: contentKind,
      content_key: key,
      requires_slots_edge: requiresSlotsEdge,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'content_kind,content_key' },
  )

  if (error) throw error
}

/**
 * @param {ContentAccessKind} kind
 * @param {string | null | undefined} key
 * @param {Map<string, boolean> | null | undefined} gatesMap
 * @param {boolean} codeDefaultRequires
 */
export function resolveRequiresSlotsEdge(kind, key, gatesMap, codeDefaultRequires) {
  const normalized = normalizeContentAccessKey(kind, key)
  if (!normalized) return codeDefaultRequires
  const gateKey = `${kind}:${normalized}`
  if (gatesMap?.has(gateKey)) return Boolean(gatesMap.get(gateKey))
  return codeDefaultRequires
}
