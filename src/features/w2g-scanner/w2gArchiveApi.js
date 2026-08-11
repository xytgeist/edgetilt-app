/**
 * Cloud archive for W-2G slips (private Storage + w2g_slips rows).
 */

import {
  formatCombineSummary,
  parseDateToIso,
  parseMoneyToNumber,
  taxYearFromDate,
} from './w2gOcr.js'

export const W2G_SLIPS_BUCKET = 'w2g-slips'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function requireUserId(supabase) {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const uid = data?.user?.id
  if (!uid) throw new Error('Sign in to save W-2Gs to your archive.')
  return uid
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} imagePath
 * @param {number} [expiresIn]
 */
export async function signedW2GImageUrl(supabase, imagePath, expiresIn = 60 * 30) {
  if (!imagePath) return ''
  const { data, error } = await supabase.storage.from(W2G_SLIPS_BUCKET).createSignedUrl(imagePath, expiresIn)
  if (error) throw error
  return data?.signedUrl || ''
}

/**
 * @param {Record<string, string>} fields
 * @param {{ ocrConfidence?: number | null }} [meta]
 */
export function fieldsToDbRow(fields, meta = {}) {
  const dateIso = parseDateToIso(fields.dateWon)
  return {
    tax_year: taxYearFromDate(fields.dateWon),
    payer_name: String(fields.payerName || '').trim(),
    payer_address: String(fields.payerAddress || '').trim(),
    payer_ein: String(fields.payerEin || '').trim(),
    box1_winnings: parseMoneyToNumber(fields.box1Winnings),
    box4_federal_withheld: parseMoneyToNumber(fields.box4FederalWithheld),
    date_won: dateIso,
    ocr_confidence: meta.ocrConfidence ?? null,
  }
}

/**
 * @param {object} row
 */
export function dbRowToFields(row) {
  const money = (n) =>
    Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  let dateWon = ''
  if (row?.date_won) {
    const iso = String(row.date_won)
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) dateWon = `${m[2]}/${m[3]}/${m[1]}`
  }
  return {
    payerName: row?.payer_name || '',
    payerAddress: row?.payer_address || '',
    payerEin: row?.payer_ein || '',
    box1Winnings: money(row?.box1_winnings),
    box4FederalWithheld: money(row?.box4_federal_withheld),
    dateWon,
  }
}

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   fields: Record<string, string>,
 *   imageBlob: Blob,
 *   ocrConfidence?: number | null,
 * }} args
 */
export async function saveW2GSlip({ supabase, fields, imageBlob, ocrConfidence = null }) {
  if (!supabase) throw new Error('Supabase client missing')
  if (!imageBlob) throw new Error('Missing slip image')
  const userId = await requireUserId(supabase)
  const slipId = crypto.randomUUID()
  const contentType = imageBlob.type || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const imagePath = `${userId}/${slipId}.${ext}`

  const { error: upErr } = await supabase.storage.from(W2G_SLIPS_BUCKET).upload(imagePath, imageBlob, {
    contentType,
    upsert: false,
  })
  if (upErr) throw upErr

  const row = {
    id: slipId,
    user_id: userId,
    ...fieldsToDbRow(fields, { ocrConfidence }),
    image_path: imagePath,
    image_content_type: contentType,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase.from('w2g_slips').insert(row).select('*').single()
  if (error) {
    try {
      await supabase.storage.from(W2G_SLIPS_BUCKET).remove([imagePath])
    } catch {
      /* ignore cleanup */
    }
    throw error
  }
  return data
}

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   taxYear?: number | null,
 * }} args
 */
export async function listW2GSlips({ supabase, taxYear = null }) {
  if (!supabase) throw new Error('Supabase client missing')
  await requireUserId(supabase)
  let q = supabase.from('w2g_slips').select('*').order('date_won', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  if (taxYear != null && Number.isFinite(Number(taxYear))) {
    q = q.eq('tax_year', Number(taxYear))
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   slip: { id: string, image_path?: string | null },
 * }} args
 */
export async function deleteW2GSlip({ supabase, slip }) {
  if (!supabase) throw new Error('Supabase client missing')
  await requireUserId(supabase)
  const id = slip?.id
  if (!id) throw new Error('Missing slip id')

  const { error } = await supabase.from('w2g_slips').delete().eq('id', id)
  if (error) throw error

  if (slip.image_path) {
    try {
      await supabase.storage.from(W2G_SLIPS_BUCKET).remove([slip.image_path])
    } catch {
      /* row gone; orphan image is acceptable */
    }
  }
}

/**
 * Update slip fields and optionally mark verified.
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   slipId: string,
 *   fields: Record<string, string>,
 *   markVerified?: boolean,
 *   ocrConfidence?: number | null,
 * }} args
 */
export async function updateW2GSlip({
  supabase,
  slipId,
  fields,
  markVerified = false,
  ocrConfidence = undefined,
}) {
  if (!supabase) throw new Error('Supabase client missing')
  await requireUserId(supabase)
  if (!slipId) throw new Error('Missing slip id')

  const row = fieldsToDbRow(fields)
  const patch = {
    tax_year: row.tax_year,
    payer_name: row.payer_name,
    payer_address: row.payer_address,
    payer_ein: row.payer_ein,
    box1_winnings: row.box1_winnings,
    box4_federal_withheld: row.box4_federal_withheld,
    date_won: row.date_won,
    updated_at: new Date().toISOString(),
  }
  if (markVerified) {
    patch.verified_at = new Date().toISOString()
  }
  if (ocrConfidence !== undefined) {
    patch.ocr_confidence = ocrConfidence
  }

  const { data, error } = await supabase
    .from('w2g_slips')
    .update(patch)
    .eq('id', slipId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** @param {object | null | undefined} slip */
export function isW2GSlipVerified(slip) {
  return Boolean(slip?.verified_at)
}

/**
 * Group slips by EIN for TurboTax combine.
 * @param {Array<object>} slips
 */
export function collateW2GSlips(slips) {
  /** @type {Map<string, object>} */
  const map = new Map()
  for (const slip of slips || []) {
    const ein = String(slip.payer_ein || '').trim() || '(missing EIN)'
    let g = map.get(ein)
    if (!g) {
      g = {
        payerEin: ein === '(missing EIN)' ? '' : ein,
        payerName: slip.payer_name || '',
        payerAddress: slip.payer_address || '',
        box1Sum: 0,
        box4Sum: 0,
        dateWon: slip.date_won || null,
        slipCount: 0,
        slips: [],
      }
      map.set(ein, g)
    }
    g.box1Sum += Number(slip.box1_winnings || 0)
    g.box4Sum += Number(slip.box4_federal_withheld || 0)
    g.slipCount += 1
    g.slips.push(slip)
    // Prefer latest date_won; refresh name/address from that slip.
    const cur = g.dateWon ? String(g.dateWon) : ''
    const next = slip.date_won ? String(slip.date_won) : ''
    if (!cur || (next && next > cur)) {
      g.dateWon = slip.date_won || g.dateWon
      if (slip.payer_name) g.payerName = slip.payer_name
      if (slip.payer_address) g.payerAddress = slip.payer_address
    }
  }

  return [...map.values()].sort((a, b) => b.box1Sum - a.box1Sum)
}

/**
 * @param {ReturnType<typeof collateW2GSlips>} groups
 */
export function formatAllCombineSummaries(groups) {
  return (groups || []).map((g) => formatCombineSummary({
    ...g,
    dateWon: g.dateWon
      ? (() => {
          const m = String(g.dateWon).match(/^(\d{4})-(\d{2})-(\d{2})/)
          return m ? `${m[2]}/${m[3]}/${m[1]}` : String(g.dateWon)
        })()
      : '',
  })).join('\n\n---\n\n')
}
