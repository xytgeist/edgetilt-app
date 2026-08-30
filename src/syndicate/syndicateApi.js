import { createClient } from '@supabase/supabase-js'

// Fallback to production Supabase URL & anon key for public read access
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://jtjgtucumuoswnbauxry.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0amd0dWN1bXVvc3duYmF1eHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNjA0MjIsImV4cCI6MjA5MjczNjQyMn0.J82Yt2f_sN8v7P9eZ1mR_v-1F9K1fF5v9R1fF5v9R1f'

export const syndicateSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

/**
 * Fetch public picks ledger and overall records from Supabase
 */
export async function fetchSyndicateLedger(limit = 60) {
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
