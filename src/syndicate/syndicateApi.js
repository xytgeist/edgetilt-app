import { createClient } from '@supabase/supabase-js'

// Fallback to production Supabase URL & anon key for public read access
const SUPABASE_URL = String(
  import.meta.env.VITE_SUPABASE_URL || 'https://jtjgtucumuoswnbauxry.supabase.co'
).trim()
const SUPABASE_ANON_KEY = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'sb_publishable_u3-GQGrZ_hswapkiWiPyLA_Ah3mxU8B'
).trim()

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
export async function fetchSyndicateLedger(limit = 250) {
  if (!syndicateSupabase) return { picks: [], error: null }
  try {
    const { data: picks, error } = await syndicateSupabase
      .from('lounge_bot_picks')
      .select('*')
      .order('commence_time', { ascending: false })
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
 * Fetch public NFL EPA rankings only (no trench win-rate columns).
 */
export async function fetchTrenchMetrics() {
  if (!syndicateSupabase) return { data: [], error: null }
  try {
    const { data, error } = await syndicateSupabase
      .from('nfl_team_metrics')
      .select('id, team_name, off_epa_play, def_epa_play')
      .order('off_epa_play', { ascending: false })

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

/**
 * Fetch public UFC Stats-style fighter metrics.
 */
export async function fetchUfcFighterMetrics() {
  if (!syndicateSupabase) return { data: [], error: null }
  try {
    const { data, error } = await syndicateSupabase
      .from('ufc_fighter_metrics')
      .select(
        'id, fighter_name, division, reach_inches, stance, slpm, sapm, str_acc, str_def, td_avg, td_acc, td_def, sub_avg, finish_rate, ko_finish_rate, sub_finish_rate'
      )
      .order('division', { ascending: true })
      .order('fighter_name', { ascending: true })

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

/**
 * Fetch CFB consensus power board (SP+ / FPI / Sagarin / Elo blend).
 */
export async function fetchCfbPowerRatings() {
  if (!syndicateSupabase) return { data: [], error: null }
  try {
    const { data, error } = await syndicateSupabase
      .from('cfb_team_power_ratings')
      .select(
        'id, team_name, team_abbr, conference, power_rating, off_rating, def_rating, tempo_rating, home_field_advantage, fpi_rating, sp_rating, sagarin_rating'
      )
      .order('power_rating', { ascending: false })
      .limit(100)

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}
