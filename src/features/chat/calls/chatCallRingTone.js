/**
 * In-app call tones via Web Audio (no asset files).
 * Incoming ringtone for callee overlay; ringback while caller waits for answer.
 */

/** @typedef {{ stop: () => void }} ChatCallToneHandle */

let sharedCtx = /** @type {AudioContext | null} */ (null)

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!sharedCtx) sharedCtx = new AC()
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume().catch(() => {})
  }
  return sharedCtx
}

/** Best-effort unlock after a user gesture (Start call / Accept / mic prompt). */
export function unlockChatCallAudio() {
  const ctx = getAudioContext()
  if (!ctx) return
  void ctx.resume().catch(() => {})
}

/**
 * @param {'incoming' | 'ringback'} kind
 * @returns {ChatCallToneHandle | null}
 */
export function startChatCallTone(kind) {
  const ctx = getAudioContext()
  if (!ctx) return null

  let stopped = false
  /** @type {number | null} */
  let timeoutId = null
  /** @type {OscillatorNode[]} */
  let liveOsc = []

  // Soft classic dual-tone (US-ish). Incoming is a bit brighter; both stay gentle.
  const cadence =
    kind === 'incoming'
      ? { onMs: 1800, offMs: 2200, freqs: [440, 480], gain: 0.035 }
      : { onMs: 2000, offMs: 4000, freqs: [440, 480], gain: 0.028 }

  const clearLive = () => {
    for (const osc of liveOsc) {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
      try {
        osc.disconnect()
      } catch {
        /* ignore */
      }
    }
    liveOsc = []
  }

  const playBurst = () => {
    if (stopped) return
    void ctx.resume().catch(() => {})
    clearLive()
    const now = ctx.currentTime
    const dur = cadence.onMs / 1000
    const master = ctx.createGain()
    // Soft attack / release so it doesn't slam like an alert siren.
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(cadence.gain, now + 0.08)
    master.gain.setValueAtTime(cadence.gain, now + dur - 0.12)
    master.gain.linearRampToValueAtTime(0, now + dur)
    master.connect(ctx.destination)

    for (const freq of cadence.freqs) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const voice = ctx.createGain()
      voice.gain.value = 0.5
      osc.connect(voice)
      voice.connect(master)
      osc.start(now)
      osc.stop(now + dur + 0.02)
      liveOsc.push(osc)
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null
      if (!stopped) playBurst()
    }, cadence.onMs + cadence.offMs)
  }

  playBurst()

  if (kind === 'incoming' && typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([200, 100, 200, 100, 200, 1400])
    } catch {
      /* ignore */
    }
  }

  return {
    stop() {
      if (stopped) return
      stopped = true
      if (timeoutId != null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      clearLive()
      if (kind === 'incoming' && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(0)
        } catch {
          /* ignore */
        }
      }
    },
  }
}

/** @param {ChatCallToneHandle | null | undefined} handle */
export function stopChatCallTone(handle) {
  try {
    handle?.stop?.()
  } catch {
    /* ignore */
  }
}
