/**
 * Route call playback to phone earpiece vs speakerphone when the browser exposes
 * audiooutput devices (Chrome Android; some newer Safari). iOS Safari/PWA often
 * cannot switch... UI still toggles, OS may keep media/speaker routing.
 */
import { Room } from 'livekit-client'

/**
 * @param {MediaDeviceInfo[]} devices
 * @param {'earpiece' | 'speakerphone'} prefer
 * @returns {string | null} deviceId
 */
export function pickCallAudioOutputDeviceId(devices, prefer) {
  const pool = (devices || []).filter((d) => d?.kind === 'audiooutput')
  if (!pool.length) return null

  const labelOf = (d) => String(d.label || '').toLowerCase()
  const isEarpiece = (d) =>
    /earpiece|ear piece|receiver|phone ear|headset earpiece/.test(labelOf(d))
  const isSpeakerphone = (d) =>
    (/speakerphone|speaker phone|\bspeaker\b/.test(labelOf(d)) || labelOf(d) === 'speaker') &&
    !isEarpiece(d)

  if (prefer === 'earpiece') {
    const hit = pool.find(isEarpiece)
    if (hit?.deviceId) return hit.deviceId
    // Prefer non-speakerphone default when labels exist.
    const nonSpeaker = pool.find((d) => labelOf(d) && !isSpeakerphone(d))
    if (nonSpeaker?.deviceId && pool.some(isSpeakerphone)) return nonSpeaker.deviceId
    return null
  }

  const hit = pool.find(isSpeakerphone)
  if (hit?.deviceId) return hit.deviceId
  const nonEar = pool.find((d) => !isEarpiece(d))
  return nonEar?.deviceId || pool[0]?.deviceId || null
}

/**
 * @param {{
 *   room?: { switchActiveDevice?: (kind: string, deviceId: string) => Promise<unknown> } | null
 *   speakerphoneOn: boolean
 *   rootSelector?: string
 * }} args
 */
export async function applyCallAudioOutput({
  room = null,
  speakerphoneOn,
  rootSelector = '[data-chat-call-session]',
}) {
  const prefer = speakerphoneOn ? 'speakerphone' : 'earpiece'
  let deviceId = null

  try {
    // requestPermissions so Android Chrome fills "Headset earpiece" / "Speakerphone" labels.
    const listed = await Room.getLocalDevices('audiooutput', true)
    deviceId = pickCallAudioOutputDeviceId(listed, prefer)
  } catch {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      deviceId = pickCallAudioOutputDeviceId(devices, prefer)
    } catch {
      deviceId = null
    }
  }

  // Empty string = browser default (often loudspeaker for web media). Only use when
  // we could not resolve a labeled earpiece/speakerphone device.
  const sinkId = deviceId || ''

  if (room && typeof room.switchActiveDevice === 'function' && sinkId) {
    try {
      await room.switchActiveDevice('audiooutput', sinkId)
    } catch {
      /* Safari / denied */
    }
  }

  const root = typeof document !== 'undefined' ? document.querySelector(rootSelector) : null
  const audios = root ? root.querySelectorAll('audio') : []

  for (const el of audios) {
    if (el && typeof el.setSinkId === 'function') {
      try {
        await el.setSinkId(sinkId)
      } catch {
        /* iOS / unsupported */
      }
    }
  }

  return { sinkId, preferred: prefer }
}
