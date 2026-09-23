/**
 * Mirror ESPN NFL headshots into Lounge R2 at sports/nfl/players/{espn_id}.png
 * and update public.nfl_players.headshot_url.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  loungeCfR2PutObject,
  loungeCfR2PublicUrl,
  readLoungeCfR2Config,
} from './loungeCfR2.ts'

export const NFL_PLAYER_HEADSHOT_R2_PREFIX = 'sports/nfl/players'

const HEADSHOT_CDN = (espnId: string) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`

const ESPN_HEADERS = {
  Accept: 'image/png,image/*,*/*',
  Referer: 'https://www.espn.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

export function nflPlayerHeadshotObjectKey(espnId: string): string {
  const id = String(espnId || '').replace(/[^0-9]/g, '')
  if (!id) throw new Error('Invalid espn_id')
  return `${NFL_PLAYER_HEADSHOT_R2_PREFIX}/${id}.png`
}

export function isNflHeadshotOnR2(url: string, publicBaseUrl: string): boolean {
  const u = String(url || '').trim()
  if (!u) return false
  try {
    const parsed = new URL(u)
    const base = String(publicBaseUrl || '').trim().replace(/\/+$/, '')
    if (base) {
      const origin = new URL(base).origin
      if (parsed.origin === origin && parsed.pathname.includes(`/${NFL_PLAYER_HEADSHOT_R2_PREFIX}/`)) {
        return true
      }
    }
    return (
      (parsed.hostname === 'media.lvslotpro.com' || parsed.hostname === 'media-test.lvslotpro.com') &&
      parsed.pathname.includes(`/${NFL_PLAYER_HEADSHOT_R2_PREFIX}/`)
    )
  } catch {
    return false
  }
}

export type NflHeadshotMirrorResult = {
  ok: true
  scanned: number
  mirrored: number
  skipped: number
  failed: number
  remaining: number
  failures: Array<{ sleeper_id: string; espn_id: string; error: string }>
}

export async function mirrorNflPlayerHeadshotsBatch(
  admin: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<NflHeadshotMirrorResult> {
  const cfg = readLoungeCfR2Config()
  if (!cfg) {
    throw new Error('R2 is not configured (LOUNGE_CF_R2_* + CLOUDFLARE_ACCOUNT_ID).')
  }

  const limit = Math.max(1, Math.min(80, Number(opts.limit) || 40))

  // Prefer players still on ESPN CDN / missing R2 path.
  const { data: rows, error } = await admin
    .from('nfl_players')
    .select('sleeper_id, espn_id, headshot_url, full_name, search_rank')
    .not('espn_id', 'is', null)
    .or('headshot_url.is.null,headshot_url.not.ilike.%/sports/nfl/players/%')
    .order('search_rank', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  const batch = (rows || []).filter((row) => {
    const espnId = String(row.espn_id || '').replace(/[^0-9]/g, '')
    if (!espnId) return false
    return !isNflHeadshotOnR2(String(row.headshot_url || ''), cfg.publicBaseUrl)
  })

  const { count: remainingCount } = await admin
    .from('nfl_players')
    .select('sleeper_id', { count: 'exact', head: true })
    .not('espn_id', 'is', null)
    .or('headshot_url.is.null,headshot_url.not.ilike.%/sports/nfl/players/%')

  let mirrored = 0
  let skipped = 0
  let failed = 0
  const failures: Array<{ sleeper_id: string; espn_id: string; error: string }> = []

  for (const row of batch) {
    const espnId = String(row.espn_id || '').replace(/[^0-9]/g, '')
    const sleeperId = String(row.sleeper_id || '')
    try {
      const objectKey = nflPlayerHeadshotObjectKey(espnId)
      const publicUrl = loungeCfR2PublicUrl(cfg, objectKey)

      const res = await fetch(HEADSHOT_CDN(espnId), { headers: ESPN_HEADERS, redirect: 'follow' })
      if (!res.ok) {
        failed += 1
        failures.push({ sleeper_id: sleeperId, espn_id: espnId, error: `espn ${res.status}` })
        // Permanent miss: stamp a skip URL under our prefix so future batches ignore the row.
        if (res.status === 404 || res.status === 403) {
          const skipUrl = loungeCfR2PublicUrl(cfg, `${NFL_PLAYER_HEADSHOT_R2_PREFIX}/_skip/${espnId}.png`)
          await admin
            .from('nfl_players')
            .update({
              headshot_url: skipUrl,
              local_headshot_path: 'espn_missing',
              updated_at: new Date().toISOString(),
            })
            .eq('sleeper_id', sleeperId)
        }
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength < 500) {
        failed += 1
        failures.push({ sleeper_id: sleeperId, espn_id: espnId, error: 'too_small' })
        const skipUrl = loungeCfR2PublicUrl(cfg, `${NFL_PLAYER_HEADSHOT_R2_PREFIX}/_skip/${espnId}.png`)
        await admin
          .from('nfl_players')
          .update({
            headshot_url: skipUrl,
            local_headshot_path: 'espn_empty',
            updated_at: new Date().toISOString(),
          })
          .eq('sleeper_id', sleeperId)
        continue
      }

      await loungeCfR2PutObject(cfg, objectKey, bytes, 'image/png')

      const { error: upErr } = await admin
        .from('nfl_players')
        .update({
          headshot_url: publicUrl,
          local_headshot_path: `/${objectKey}`,
          updated_at: new Date().toISOString(),
        })
        .eq('sleeper_id', sleeperId)

      if (upErr) {
        failed += 1
        failures.push({ sleeper_id: sleeperId, espn_id: espnId, error: upErr.message })
        continue
      }
      mirrored += 1
    } catch (err) {
      failed += 1
      failures.push({
        sleeper_id: sleeperId,
        espn_id: espnId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const remaining = Math.max(0, Number(remainingCount) || 0 - mirrored - (failed > 0 ? batch.length : 0))
  // Re-count after updates for accurate remaining
  const { count: afterCount } = await admin
    .from('nfl_players')
    .select('sleeper_id', { count: 'exact', head: true })
    .not('espn_id', 'is', null)
    .or('headshot_url.is.null,headshot_url.not.ilike.%/sports/nfl/players/%')

  return {
    ok: true,
    scanned: batch.length,
    mirrored,
    skipped,
    failed,
    remaining: Number(afterCount) || 0,
    failures: failures.slice(0, 20),
  }
}
