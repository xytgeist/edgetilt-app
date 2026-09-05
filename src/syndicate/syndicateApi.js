import { createClient } from '@supabase/supabase-js'
import { SHARPE_SYNDICATE_HANDLE } from './syndicateBotIdentity.js'

// Public sharpesyndicate.com is the production book. Do not inherit EdgeTilt
// `VITE_SUPABASE_URL` (local .env is the test sandbox). Override only with
// `VITE_SYNDICATE_SUPABASE_URL` / `VITE_SYNDICATE_SUPABASE_ANON_KEY`.
const SUPABASE_URL = String(
  import.meta.env.VITE_SYNDICATE_SUPABASE_URL || 'https://jtjgtucumuoswnbauxry.supabase.co'
).trim()
const SUPABASE_ANON_KEY = String(
  import.meta.env.VITE_SYNDICATE_SUPABASE_ANON_KEY ||
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

const SETTLED_PICK_STATUSES = ['won', 'lost', 'push']
const SETTLED_LEDGER_PAGE_SIZE = 1000
const SETTLED_LEDGER_MAX_ROWS = 8000

const SETTLED_PICK_COLUMNS = [
  'id',
  'bot_user_id',
  'picker_name',
  'event_id',
  'sport_key',
  'home_team',
  'away_team',
  'commence_time',
  'market_key',
  'pick_name',
  'pick_line',
  'pick_price',
  'status',
  'home_score',
  'away_score',
  'units_net',
  'created_at',
  'resolved_at',
  'metadata',
].join(', ')

async function resolveSyndicateBotUserId() {
  const { data, error } = await syndicateSupabase
    .from('profiles')
    .select('user_id')
    .eq('handle', SHARPE_SYNDICATE_HANDLE)
    .maybeSingle()
  if (error) {
    console.warn('Could not resolve Sharpe Syndicate bot profile:', error.message)
    return null
  }
  return data?.user_id || null
}

/**
 * Public Overview / Audited Ledger: finished Syndicate W-L only.
 * Newest-kickoff limit is wrong here... Saturday pending fills that window and
 * finished Thursday/Friday grades fall off. Pending rows cannot be won/lost yet,
 * so they do not belong in the record fetch at all.
 */
export async function fetchSyndicateLedger() {
  if (!syndicateSupabase) return { picks: [], error: null }
  try {
    const botUserId = await resolveSyndicateBotUserId()
    if (!botUserId) {
      const error = new Error('Sharpe Syndicate profile not found')
      console.warn('Could not fetch remote picks, using fallback model metrics:', error.message)
      return { picks: [], error }
    }

    const picks = []
    for (let from = 0; from < SETTLED_LEDGER_MAX_ROWS; from += SETTLED_LEDGER_PAGE_SIZE) {
      const to = Math.min(from + SETTLED_LEDGER_PAGE_SIZE - 1, SETTLED_LEDGER_MAX_ROWS - 1)
      const { data, error } = await syndicateSupabase
        .from('lounge_bot_picks')
        .select(SETTLED_PICK_COLUMNS)
        .eq('bot_user_id', botUserId)
        .in('status', SETTLED_PICK_STATUSES)
        .order('commence_time', { ascending: false })
        .range(from, to)

      if (error) {
        console.warn('Could not fetch remote picks, using fallback model metrics:', error.message)
        return { picks: [], error }
      }

      const rows = data || []
      picks.push(...rows)
      if (rows.length < SETTLED_LEDGER_PAGE_SIZE) break
    }

    return { picks, error: null }
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
 * Fetch CFB consensus power board for the public syndicate site.
 * Component model ratings are intentionally omitted from this client select
 * (public UI uses blurred placeholders instead of live SP+/FPI/Sagarin values).
 */
export async function fetchCfbPowerRatings() {
  if (!syndicateSupabase) return { data: [], error: null }
  try {
    const { data, error } = await syndicateSupabase
      .from('cfb_team_power_ratings')
      .select(
        'id, team_name, team_abbr, conference, power_rating, off_rating, def_rating, tempo_rating, home_field_advantage'
      )
      .order('power_rating', { ascending: false })
      .limit(100)

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}
