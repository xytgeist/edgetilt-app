/**
 * Safari / iOS Audio Session hints for LiveKit calls.
 *
 * `play-and-record` tells the OS this is a conferencing session (may bias earpiece).
 * On hangup we kick back through playback → auto so normal media routing recovers.
 *
 * Feature-detect only... no-op where navigator.audioSession is missing.
 */

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
 * @returns {boolean} true when applied
 */
export function enterCallAudioSession() {
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
