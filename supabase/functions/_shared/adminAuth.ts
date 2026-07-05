import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export const adminOpsCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function adminOpsJson(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...adminOpsCorsHeaders, 'Content-Type': 'application/json' },
  })
}

function projectRefFromUrl(supabaseUrl: string): string | null {
  return supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1] ?? null
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

/** Legacy service_role JWT from Vault (Dashboard API → service_role row). */
function isServiceRoleJwtForProject(bearer: string, supabaseUrl: string): boolean {
  if (!bearer.startsWith('eyJ')) return false
  const payload = parseJwtPayload(bearer)
  if (!payload || payload.role !== 'service_role') return false
  const ref = projectRefFromUrl(supabaseUrl)
  if (ref && payload.ref && String(payload.ref) !== ref) return false
  return true
}

function secretKeysFromEnv(): string[] {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return Object.values(parsed).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Accept cron/pg_net credential: exact env match, legacy service_role JWT, or sb_secret_* from SUPABASE_SECRET_KEYS.
 * Edge SUPABASE_SERVICE_ROLE_KEY may differ from Dashboard legacy JWT even on the same project.
 */
export function isKnownServiceRoleBearer(
  bearer: string,
  serviceRoleKey: string,
  supabaseUrl: string,
): boolean {
  if (!bearer) return false
  if (bearer === serviceRoleKey) return true
  if (isServiceRoleJwtForProject(bearer, supabaseUrl)) return true
  if (bearer.startsWith('sb_secret_') && secretKeysFromEnv().includes(bearer)) return true
  return false
}

/** pg_net often sends service role on apikey only (sb_secret must not use Authorization Bearer). */
export function serviceRoleCredentialFromRequest(req: Request): string {
  const authBearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (authBearer) return authBearer
  return (req.headers.get('apikey') || '').trim()
}

/** Service role (cron) or admin user JWT (portal). */
export async function authorizeServiceRoleOrAdmin(req: Request): Promise<SupabaseClient> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw adminOpsJson(503, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' })
  }

  const credential = serviceRoleCredentialFromRequest(req)
  if (isKnownServiceRoleBearer(credential, serviceRoleKey, supabaseUrl)) {
    return createClient(supabaseUrl, credential || serviceRoleKey)
  }

  const { admin } = await requireAdminUser(req)
  return admin
}

/** Validates Supabase user JWT and ensures profiles.role = admin. */
export async function requireAdminUser(req: Request): Promise<{ admin: SupabaseClient; user: User }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw adminOpsJson(503, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    throw adminOpsJson(401, { error: 'Missing Authorization bearer token.' })
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(jwt)

  if (userErr || !user?.id) {
    throw adminOpsJson(401, { error: 'Invalid or expired session.' })
  }

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileErr) {
    throw adminOpsJson(500, { error: `Profile lookup failed: ${profileErr.message}` })
  }

  if (profile?.role !== 'admin') {
    throw adminOpsJson(403, { error: 'Admin role required.' })
  }

  return { admin, user }
}
