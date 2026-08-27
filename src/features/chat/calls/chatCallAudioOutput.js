/**
 * Route call audio between earpiece and speakerphone when the browser can.
 *
 * Chrome Android does **not** support HTMLMediaElement.setSinkId. Instead it exposes
 * phantom `audioinput` devices labeled "Headset earpiece" / "Speakerphone" (from
 * Chromium AudioManagerAndroid). Switching the LiveKit mic to that deviceId also
 * routes remote playback to the matching path.
 *
 * iPhone (typical): no phantom routes and no setSinkId → `canToggleCallAudioRoute`
 * is false. UI must hide the speaker button; use AudioSession play-and-record instead.
 */
import { Room, Track } from 'livekit-client'
import { isEdgeiOSShell, edgeNativeInvoke } from '../../../utils/edgeNative.js'
import { isIosDevice } from '../../../utils/pwaNotificationPrompt.js'

/**
 * @param {MediaDeviceInfo | { label?: string, kind?: string, deviceId?: string }} d
 */
function labelOf(d) {
  return String(d?.label || '').toLowerCase()
}

/**
 * @param {MediaDeviceInfo | { label?: string }} d
 */
export function isEarpieceLabel(d) {
  const label = labelOf(d)
  return /headset earpiece|earpiece|ear piece|phone ear|receiver/.test(label)
}

/**
 * @param {MediaDeviceInfo | { label?: string }} d
 */
export function isSpeakerphoneLabel(d) {
  const label = labelOf(d)
  if (isEarpieceLabel(d)) return false
  return label === 'speakerphone' || /speakerphone|speaker phone/.test(label) || label === 'speaker'
}

/**
 * @param {MediaDeviceInfo[]} devices
 * @param {'earpiece' | 'speakerphone'} prefer
 * @returns {{ deviceId: string, kind: 'audioinput' | 'audiooutput' } | null}
 */
export function pickCallAudioRoute(devices, prefer) {
  const list = devices || []
  const inputs = list.filter((d) => d?.kind === 'audioinput' && d.deviceId)
  const outputs = list.filter((d) => d?.kind === 'audiooutput' && d.deviceId)

  if (prefer === 'speakerphone') {
    const inHit = inputs.find(isSpeakerphoneLabel)
    if (inHit?.deviceId) return { deviceId: inHit.deviceId, kind: 'audioinput' }
    const outHit = outputs.find(isSpeakerphoneLabel)
    if (outHit?.deviceId) return { deviceId: outHit.deviceId, kind: 'audiooutput' }
    return null
  }

  // Ear / private: prefer real headset if connected, else phantom earpiece.
  const bluetooth = inputs.find((d) => /bluetooth/.test(labelOf(d)))
  if (bluetooth?.deviceId) return { deviceId: bluetooth.deviceId, kind: 'audioinput' }
  const wired = inputs.find((d) => /wired headset|wired headphone|headphones/.test(labelOf(d)))
  if (wired?.deviceId) return { deviceId: wired.deviceId, kind: 'audioinput' }

  const inHit = inputs.find(isEarpieceLabel)
  if (inHit?.deviceId) return { deviceId: inHit.deviceId, kind: 'audioinput' }
  const outHit = outputs.find(isEarpieceLabel)
  if (outHit?.deviceId) return { deviceId: outHit.deviceId, kind: 'audiooutput' }
  return null
}

/**
 * @returns {Promise<MediaDeviceInfo[]>}
 */
async function listAudioDevices() {
  /** @type {MediaDeviceInfo[]} */
  let devices = []
  try {
    const inputs = await Room.getLocalDevices('audioinput', true)
    devices = devices.concat(inputs || [])
  } catch {
    /* ignore */
  }
  try {
    const outputs = await Room.getLocalDevices('audiooutput', true)
    devices = devices.concat(outputs || [])
  } catch {
    /* ignore */
  }
  if (devices.length) return devices
  try {
    return await navigator.mediaDevices.enumerateDevices()
  } catch {
    return []
  }
}

function elementSupportsSetSinkId() {
  try {
    return typeof HTMLAudioElement !== 'undefined'
      && typeof HTMLAudioElement.prototype.setSinkId === 'function'
  } catch {
    return false
  }
}

/**
 * True when we can actually switch earpiece ↔ speakerphone (not a UI lie).
 * Android: phantom mic pair. Newer Safari/desktop: distinct audiooutput sinks + setSinkId.
 * @returns {Promise<boolean>}
 */
export async function canToggleCallAudioRoute() {
  try {
    if (isEdgeiOSShell()) return true

    // Safari / iOS PWA cannot reliably switch earpiece ↔ speakerphone from the web.
    if (isIosDevice()) return false

    const devices = await listAudioDevices()
    const ear = pickCallAudioRoute(devices, 'earpiece')
    const speaker = pickCallAudioRoute(devices, 'speakerphone')
    if (!ear?.deviceId || !speaker?.deviceId || ear.deviceId === speaker.deviceId) {
      return false
    }
    // Phantom Android audioinput pair is enough (no setSinkId there).
    if (ear.kind === 'audioinput' && speaker.kind === 'audioinput') return true
    // Output-device path requires setSinkId support.
    if (ear.kind === 'audiooutput' || speaker.kind === 'audiooutput') {
      return elementSupportsSetSinkId()
    }
    return false
  } catch {
    return false
  }
}

/**
 * @param {{
 *   room?: {
 *     getActiveDevice?: (kind: string) => string | undefined
 *     switchActiveDevice?: (kind: string, deviceId: string, exact?: boolean) => Promise<unknown>
 *     localParticipant?: {
 *       getTrackPublication?: (source: unknown) => { track?: { restartTrack?: (opts: unknown) => Promise<void> } } | undefined
 *     }
 *   } | null
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

  if (isEdgeiOSShell()) {
    try {
      await edgeNativeInvoke('setAudioRoute', {
        route: speakerphoneOn ? 'speaker' : 'earpiece',
      })
      return {
        preferred: prefer,
        routed: true,
        method: 'native',
        deviceId: null,
        canRoute: true,
      }
    } catch {
      return {
        preferred: prefer,
        routed: false,
        method: 'native-error',
        deviceId: null,
        canRoute: true,
      }
    }
  }

  const canRoute = await canToggleCallAudioRoute()
  if (!canRoute) {
    return {
      preferred: prefer,
      routed: false,
      method: 'unsupported',
      deviceId: null,
      canRoute: false,
    }
  }

  const devices = await listAudioDevices()
  const route = pickCallAudioRoute(devices, prefer)

  let routed = false
  let method = 'none'

  const alreadyActive =
    route &&
    room &&
    typeof room.getActiveDevice === 'function' &&
    room.getActiveDevice(route.kind) === route.deviceId

  if (alreadyActive) {
    return {
      preferred: prefer,
      routed: true,
      method: 'already',
      deviceId: route.deviceId,
      canRoute: true,
    }
  }

  if (route && room && typeof room.switchActiveDevice === 'function') {
    try {
      await room.switchActiveDevice(route.kind, route.deviceId, true)
      routed = true
      method = route.kind
    } catch {
      /* try restartTrack / setSinkId below */
    }
  }

  // Fallback: restart local mic onto phantom Speakerphone / Headset earpiece.
  if (!routed && route?.kind === 'audioinput' && room?.localParticipant) {
    const pub = room.localParticipant.getTrackPublication?.(Track.Source.Microphone)
    const track = pub?.track
    if (track && typeof track.restartTrack === 'function') {
      try {
        await track.restartTrack({ deviceId: { exact: route.deviceId } })
        routed = true
        method = 'audioinput-restart'
      } catch {
        try {
          await track.restartTrack({ deviceId: route.deviceId })
          routed = true
          method = 'audioinput-restart'
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Desktop / newer Safari: setSinkId on RoomAudioRenderer <audio> elements.
  if (route?.kind === 'audiooutput' || (!routed && route?.deviceId)) {
    const sinkId = route.deviceId
    const root = typeof document !== 'undefined' ? document.querySelector(rootSelector) : null
    const audios = root ? root.querySelectorAll('audio') : []
    for (const el of audios) {
      if (el && typeof el.setSinkId === 'function') {
        try {
          await el.setSinkId(sinkId)
          routed = true
          if (method === 'none') method = 'setSinkId'
        } catch {
          /* Chrome Android: setSinkId unsupported */
        }
      }
    }
  }

  return {
    preferred: prefer,
    routed,
    method,
    deviceId: route?.deviceId || null,
    canRoute: Boolean(route),
  }
}
