/**
 * Signed-in check for read-only Edge endpoints. `getClaims` verifies asymmetric (ES256) session JWTs locally
 * against the cached project JWKS … no Auth round trip per request. Symmetric (HS256) projects fall back to an
 * Auth call inside `getClaims`, and any failure falls back to `getUser`, so behavior matches the old check.
 * Tradeoff: a revoked session keeps working until its JWT expires (~1h), fine for public-ish game data.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

let verifier: SupabaseClient | null = null

function verifierClient(): SupabaseClient | null {
  if (verifier) return verifier
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return verifier
}

export async function userIdFromJwt(jwt: string, fallback?: SupabaseClient): Promise<string | null> {
  const token = String(jwt || '').trim()
  if (!token) return null
  const client = verifierClient() || fallback
  if (!client) return null
  try {
    const { data, error } = await client.auth.getClaims(token)
    const sub = data?.claims?.sub
    if (!error && sub && data?.claims?.role === 'authenticated') return String(sub)
  } catch {
    // fall through to the network check
  }
  const { data: { user }, error } = await client.auth.getUser(token)
  return !error && user?.id ? user.id : null
}
