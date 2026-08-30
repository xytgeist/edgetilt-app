import { createClient } from '@supabase/supabase-js'

// Fallback to production Supabase URL & anon key for public read access
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const syndicateSupabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null

/**
 * Fetch public picks ledger and overall records from Supabase
 */
export async function fetchSyndicateLedger(limit = 60) {
  if (!syndicateSupabase) return { picks: [], error: null }
  try {
    const { data: picks, error } = await syndicateSupabase
      .from('lounge_bot_picks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('Could not fetch remote picks, using fallback model metrics:', error.message)
      return { picks: [], error }
    }

    return { picks: picks || [], error: null }
  } catch (err) {
    return { picks: [], error: err }
  }
}

/**
 * Fetch Team EPA & Trench rankings
 */
export async function fetchTrenchMetrics() {
  if (!syndicateSupabase) return { data: [], error: null }
  try {
    const { data, error } = await syndicateSupabase
      .from('nfl_team_metrics')
      .select('*')
      .order('off_epa_play', { ascending: false })

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

/**
 * Fetch CFB Power Index ratings
 */
export async function fetchCfbPowerRatings() {
  if (!syndicateSupabase) return { data: [], error: null }
  try {
    const { data, error } = await syndicateSupabase
      .from('cfb_team_power_ratings')
      .select('*')
      .order('power_rating', { ascending: false })
      .limit(50)

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}
