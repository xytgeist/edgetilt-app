import { tabToAppProductSectionId } from '../constants/appProductSections.js'

const DEBOUNCE_MS = 45_000
/** @type {Map<string, number>} */
const lastRecordedBySection = new Map()

/**
 * Record a product section visit for signed-in members (debounced per section).
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string | null | undefined} sectionId
 */
export async function recordAppSectionVisit(supabaseClient, sectionId) {
  const id = String(sectionId || '').trim()
  if (!supabaseClient || !id) return

  const now = Date.now()
  const last = lastRecordedBySection.get(id) || 0
  if (now - last < DEBOUNCE_MS) return
  lastRecordedBySection.set(id, now)

  const { error } = await supabaseClient.rpc('record_app_section_visit', {
    p_section_id: id,
  })
  if (error && import.meta.env.DEV) {
    console.debug('[appSectionVisit]', id, error.message)
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
