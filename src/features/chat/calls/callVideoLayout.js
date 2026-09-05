/**
 * Count-based video-call tile plan. You never leave the bottom-right cell.
 * Keep in sync with `layoutVideoViews` in `ios/EdgeTilt/EdgeLiveKitCallManager.swift`.
 *
 * 1: You fill the stage
 * 2: remote full-bleed, You inset
 * 3–4: featured full-bleed, others + You stacked on the right (You bottom)
 * 5+: featured top half, rest in 2 rows (floor/ceil) with You last on the bottom row
 */

/**
 * @param {{
 *   remoteIds?: string[],
 *   localId?: string | null,
 *   featuredId?: string | null,
 * }} args
 */
export function planCallVideoLayout({
  remoteIds = [],
  localId = null,
  featuredId = null,
} = {}) {
  const remotes = remoteIds.map((id) => String(id || '').trim()).filter(Boolean)
  const you = String(localId || '').trim() || null
  const count = remotes.length + (you ? 1 : 0)
  const featured =
    remotes.includes(String(featuredId || '').trim())
      ? String(featuredId).trim()
      : remotes[0] || null
  const otherRemotes = remotes.filter((id) => id !== featured)
  const restWithYou = you ? [...otherRemotes, you] : otherRemotes

  if (count <= 1) {
    return { mode: 'solo', count, featuredId: you, youId: you }
  }
  if (count === 2) {
    return { mode: 'duo', count, featuredId: remotes[0] || null, youId: you }
  }
  if (count <= 4) {
    return {
      mode: 'stack',
      count,
      featuredId: featured,
      stackIds: restWithYou,
      youId: you,
    }
  }

  const row0n = Math.floor(restWithYou.length / 2)
  return {
    mode: 'grid',
    count,
    featuredId: featured,
    row0: restWithYou.slice(0, row0n),
    row1: restWithYou.slice(row0n),
    youId: you,
  }
}

export const CALL_STREAM_DOUBLE_TAP_MS = 320
