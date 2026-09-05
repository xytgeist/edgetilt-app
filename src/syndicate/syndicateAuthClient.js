import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = String(
  import.meta.env.VITE_SYNDICATE_SUPABASE_URL || 'https://jtjgtucumuoswnbauxry.supabase.co'
).trim()
const SUPABASE_ANON_KEY = String(
  import.meta.env.VITE_SYNDICATE_SUPABASE_ANON_KEY ||
    'sb_publishable_u3-GQGrZ_hswapkiWiPyLA_Ah3mxU8B'
).trim()

/**
 * Session-capable client for Syndicate Ops only.
 * Public ledger stays on syndicateApi.js (persistSession: false).
 */
export const syndicateAuthClient =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'sb-syndicate-ops-auth',
        },
      })
    : null
