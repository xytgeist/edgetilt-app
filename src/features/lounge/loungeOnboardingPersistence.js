import {
  readLoungeFabHintAck,
  readLoungeSlotsMenuHintAck,
  readLoungeWelcomeAck,
  writeLoungeFabHintAck,
  writeLoungeSlotsMenuHintAck,
  writeLoungeWelcomeAck,
} from './loungeStorage.js'
import {
  readLoungeDockMenuLayoutIntroCompleted,
  writeLoungeDockMenuLayoutIntroCompleted,
} from '../../utils/loungeDockFabPosition.js'

const ONBOARDING_SELECT =
  'lounge_welcome_seen_at, lounge_slots_menu_hint_seen_at, lounge_fab_hint_seen_at, lounge_dock_menu_layout_intro_seen_at'

function isMissingColumnError(error) {
  const code = String(error?.code || '')
  const msg = String(error?.message || '')
  return code === '42703' || /lounge_welcome_seen_at|lounge_slots_menu_hint_seen_at|lounge_fab_hint_seen_at|lounge_dock_menu_layout_intro_seen_at/i.test(msg)
}

/**
 * Hydrate browser ack maps from profile timestamps (cross-device / cleared storage).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 */
export async function syncLoungeOnboardingFromProfile(supabaseClient, userId) {
  if (!supabaseClient || !userId) return
  const { data, error } = await supabaseClient
    .from('profiles')
    .select(ONBOARDING_SELECT)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (isMissingColumnError(error)) return
    return
  }
  if (!data) return
  if (data.lounge_welcome_seen_at) writeLoungeWelcomeAck(userId)
  if (data.lounge_slots_menu_hint_seen_at) writeLoungeSlotsMenuHintAck(userId)
  if (data.lounge_fab_hint_seen_at) writeLoungeFabHintAck(userId)
  if (data.lounge_dock_menu_layout_intro_seen_at) writeLoungeDockMenuLayoutIntroCompleted(userId)
}

async function persistProfileOnboardingFlag(supabaseClient, userId, column) {
  if (!supabaseClient || !userId || !column) return
  const now = new Date().toISOString()
  const { error } = await supabaseClient
    .from('profiles')
    .update({ [column]: now, updated_at: now })
    .eq('user_id', userId)
  if (error && !isMissingColumnError(error)) {
    console.warn('[loungeOnboarding] persist failed', column, error.message)
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient @param {string | null | undefined} userId */
export function markLoungeWelcomeSeen(supabaseClient, userId) {
  if (userId) writeLoungeWelcomeAck(userId)
  void persistProfileOnboardingFlag(supabaseClient, userId, 'lounge_welcome_seen_at')
}

/** @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient @param {string | null | undefined} userId */
export function markLoungeSlotsMenuHintSeen(supabaseClient, userId) {
  if (userId) writeLoungeSlotsMenuHintAck(userId)
  void persistProfileOnboardingFlag(supabaseClient, userId, 'lounge_slots_menu_hint_seen_at')
}

/** @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient @param {string | null | undefined} userId */
export function markLoungeFabHintSeen(supabaseClient, userId) {
  if (userId) writeLoungeFabHintAck(userId)
  void persistProfileOnboardingFlag(supabaseClient, userId, 'lounge_fab_hint_seen_at')
}

/** @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient @param {string | null | undefined} userId */
export function markLoungeDockMenuLayoutIntroSeen(supabaseClient, userId) {
  writeLoungeDockMenuLayoutIntroCompleted(userId)
  void persistProfileOnboardingFlag(supabaseClient, userId, 'lounge_dock_menu_layout_intro_seen_at')
}

/** Convenience for gating without hitting DB on every read. */
export function loungeWelcomeSeenLocally(userId) {
  return Boolean(userId && readLoungeWelcomeAck(userId))
}

export function loungeSlotsMenuHintSeenLocally(userId) {
  return Boolean(userId && readLoungeSlotsMenuHintAck(userId))
}

export function loungeFabHintSeenLocally(userId) {
  return Boolean(userId && readLoungeFabHintAck(userId))
}
