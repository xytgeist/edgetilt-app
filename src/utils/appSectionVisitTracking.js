import { tabToAppProductSectionId } from '../constants/appProductSections.js'

const DEBOUNCE_MS = 45_000
/** @type {Map<string, number>} */
const lastRecordedByKey = new Map()

/** @typedef {'visit' | 'session_recorded'} AppProductEventKind */

/**
 * @param {string} sectionId
 * @param {AppProductEventKind} eventKind
 * @param {string | null | undefined} subSectionId
 */
function visitTrackingKey(sectionId, eventKind, subSectionId) {
  return `${sectionId}::${eventKind}::${subSectionId || ''}`
}

/**
 * Record a product section visit or session event for signed-in members.
 * Tab visits debounce 45s per section; session_recorded fires immediately.
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string | null | undefined} sectionId
 * @param {{ subSectionId?: string | null, eventKind?: AppProductEventKind }} [opts]
 */
export async function recordAppSectionVisit(supabaseClient, sectionId, opts = {}) {
  const id = String(sectionId || '').trim()
  const subSectionId = opts.subSectionId ? String(opts.subSectionId).trim() : null
  const eventKind = opts.eventKind === 'session_recorded' ? 'session_recorded' : 'visit'
  if (!supabaseClient || !id) return

  if (eventKind === 'visit') {
    const key = visitTrackingKey(id, eventKind, subSectionId)
    const now = Date.now()
    const last = lastRecordedByKey.get(key) || 0
    if (now - last < DEBOUNCE_MS) return
    lastRecordedByKey.set(key, now)
  }

  const { error } = await supabaseClient.rpc('record_app_section_visit', {
    p_section_id: id,
    p_sub_section_id: subSectionId,
    p_event_kind: eventKind,
  })
  if (error && import.meta.env.DEV) {
    console.debug('[appSectionVisit]', id, subSectionId, eventKind, error.message)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string | null | undefined} tab
 */
export async function recordAppSectionVisitForTab(supabaseClient, tab) {
  const sectionId = tabToAppProductSectionId(tab)
  if (!sectionId) return
  await recordAppSectionVisit(supabaseClient, sectionId)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string | null | undefined} calculatorKey
 */
export async function recordAppCalculatorVisit(supabaseClient, calculatorKey) {
  const key = String(calculatorKey || '').trim().toLowerCase()
  if (!key) return
  await recordAppSectionVisit(supabaseClient, 'calculators', { subSectionId: key })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {'play-logbook' | 'poker-bankroll'} sectionId
 * @param {string | null | undefined} subSectionId
 */
export async function recordAppSessionRecorded(supabaseClient, sectionId, subSectionId) {
  const sub = String(subSectionId || '').trim()
  if (!sub) return
  await recordAppSectionVisit(supabaseClient, sectionId, {
    subSectionId: sub,
    eventKind: 'session_recorded',
  })
}
