/** Supabase test sandbox (`lvslotpro.com`). */
const TEST_PROJECT_REF = 'kcosfvmreeiosdjdzycb'

/**
 * Public SPA origin for transactional links (claim URLs, CTAs).
 * Prefer explicit `PUBLIC_APP_URL`; infer test from `SUPABASE_URL` when unset.
 */
export function resolvePublicAppOrigin(): string {
  const fromEnv = Deno.env.get('PUBLIC_APP_URL')?.trim() || Deno.env.get('APP_ORIGIN')?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  if (supabaseUrl.includes(TEST_PROJECT_REF)) return 'https://lvslotpro.com'
  return 'https://edgetilt.com'
}
