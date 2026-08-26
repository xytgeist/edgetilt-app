/**
 * Safari / iOS Audio Session hints for LiveKit calls.
 *
 * `play-and-record` tells the OS this is a conferencing session (may bias earpiece).
 * On hangup we kick back through playback → auto so normal media routing recovers.
 *
 * EdgeiOS shell → native `setAudioSession` (`voiceChat` / `default`).
 * Feature-detect only elsewhere ... no-op where navigator.audioSession is missing.
 */
import { edgeNativeInvoke, isEdgeiOSShell } from '../../../utils/edgeNative.js'

function getAudioSession() {
  if (typeof navigator === 'undefined') return null
  try {
    const session = navigator.audioSession
    if (!session || typeof session !== 'object') return null
    return session
  } catch {
    return null
  }
}

/**
 * @returns {boolean}
 */
export function supportsCallAudioSession() {
  return Boolean(getAudioSession())
}

/**
 * Enter telephony-style session after mic is live.
 * @param {{ preferSpeaker?: boolean, isVideo?: boolean }} [options]
 * @returns {boolean} true when applied
 */
export function enterCallAudioSession(options = {}) {
  const preferSpeaker = Boolean(options.preferSpeaker)
  const isVideo = Boolean(options.isVideo)
  if (isEdgeiOSShell()) {
    const mode = isVideo || preferSpeaker ? 'voiceChat' : 'voiceChatEarpiece'
    void edgeNativeInvoke('setAudioSession', { mode }).catch(() => {})
    return true
  }
  const session = getAudioSession()
  if (!session) return false
  try {
    session.type = 'play-and-record'
    return true
  } catch {
    return false
  }
}

/**
 * Leave call session so Spotify / YouTube routing feels normal again.
 * @returns {boolean} true when reset attempted
 */
export function exitCallAudioSession() {
  if (isEdgeiOSShell()) {
    void edgeNativeInvoke('setAudioSession', { mode: 'default' }).catch(() => {})
    return true
  }
  const session = getAudioSession()
  if (!session) return false
  try {
    // Known kick: playback then auto after releasing the mic.
    session.type = 'playback'
    session.type = 'auto'
    return true
  } catch {
    try {
      session.type = 'auto'
      return true
    } catch {
      return false
    }
  }
}
