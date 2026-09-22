/**
 * Lounge Cloudflare Stream upload caps.
 * Keep in step with `src/utils/loungeVideoUpload.js`.
 *
 * Free matches X non-subscribers: 2:20 and 512 MB.
 * Edge Pro (including Slots Edge Pro, Lifetime, and staff): 20 minutes and 8 GB.
 * `maxDurationSeconds` is a few seconds above the product cap so probe drift is not rejected.
 * Stream reserves that many minutes until the upload finishes or the link expires.
 */

export const LOUNGE_VIDEO_FREE_MAX_SECONDS = 140
export const LOUNGE_VIDEO_EDGE_PRO_MAX_SECONDS = 20 * 60
export const LOUNGE_STREAM_DURATION_HEADROOM_SECONDS = 15
export const LOUNGE_VIDEO_FREE_MAX_BYTES = 512 * 1024 * 1024
export const LOUNGE_VIDEO_EDGE_PRO_MAX_BYTES = 8 * 1024 * 1024 * 1024

export type LoungeStreamUploadAllowance = {
  edgePro: boolean
  maxSeconds: number
  maxBytes: number
  maxDurationSeconds: number
}

type EntitlementAdmin = {
  rpc: (
    fn: string,
    args: { p_user_id: string },
  ) => Promise<{ data: boolean | null; error: { message?: string } | null }>
}

export async function loungeStreamUploadAllowance(
  admin: EntitlementAdmin,
  userId: string,
): Promise<LoungeStreamUploadAllowance> {
  const { data, error } = await admin.rpc('has_edge_pro_entitlement', { p_user_id: userId })
  const edgePro = !error && data === true
  const maxSeconds = edgePro ? LOUNGE_VIDEO_EDGE_PRO_MAX_SECONDS : LOUNGE_VIDEO_FREE_MAX_SECONDS
  const maxBytes = edgePro ? LOUNGE_VIDEO_EDGE_PRO_MAX_BYTES : LOUNGE_VIDEO_FREE_MAX_BYTES
  return {
    edgePro,
    maxSeconds,
    maxBytes,
    maxDurationSeconds: maxSeconds + LOUNGE_STREAM_DURATION_HEADROOM_SECONDS,
  }
}

export function loungeVideoTooLargeMessage(maxBytes: number): string {
  const gb = maxBytes / (1024 * 1024 * 1024)
  if (gb >= 1 && Math.abs(gb - Math.round(gb)) < 0.01) {
    return `Video must be ${Math.round(gb)} GB or smaller for upload.`
  }
  return `Video must be ${Math.max(1, Math.round(maxBytes / (1024 * 1024)))} MB or smaller for upload.`
}

/** Replace or append tus `maxDurationSeconds` so the client cannot reserve a longer Stream slot. */
export function rewriteTusMaxDuration(metadata: string, maxDurationSeconds: number): string {
  const value = btoa(String(maxDurationSeconds))
  const parts = String(metadata || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^maxDurationSeconds(\s|$)/i.test(part))
  parts.push(`maxDurationSeconds ${value}`)
  return parts.join(',')
}
