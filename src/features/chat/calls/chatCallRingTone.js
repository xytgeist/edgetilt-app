/**
 * In-app call tones via Web Audio (no asset files).
 * Incoming ringtone for callee overlay; ringback while caller waits for answer.
 *
 * iOS/Android: AudioContext stays suspended until a user gesture. We prime on
 * pointer/key interaction so incoming can ring without tapping Answer first.
 */

/** @typedef {{ stop: () => void }} ChatCallToneHandle */

let sharedCtx = /** @type {AudioContext | null} */ (null)
let unlockInstalled = false

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!sharedCtx) sharedCtx = new AC()
  return sharedCtx
}

async function resumeAudioContext() {
  const ctx = getAudioContext()
  if (!ctx) return null
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      /* still locked */
    }
  }
  return ctx
}

/** Best-effort unlock after a user gesture (Start call / Accept / mic prompt). */
export function unlockChatCallAudio() {
  void resumeAudioContext()
}

/**
 * Keep the shared AudioContext primed from normal app taps so incoming can ring
 * without waiting for Accept (autoplay policy).
 */
export function installChatCallAudioUnlock() {
  if (typeof window === 'undefined' || unlockInstalled) return
  unlockInstalled = true

  const onGesture = () => {
    void resumeAudioContext()
  }

  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  window.addEventListener('keydown', onGesture, { capture: true })
  window.addEventListener('touchend', onGesture, { capture: true, passive: true })

  // If something already unlocked us (mic prompt), stay warm.
  void resumeAudioContext()
}

let activeHandles = new Set()
/** Single outgoing ringback so Start tap + CallChrome do not stack tones. */
let outgoingRingbackHandle = /** @type {ChatCallToneHandle | null} */ (null)

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
      : { onMs: 2000, offMs: 4000, freqs: [440, 480], gain: 0.055 }

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
    if (ctx.state !== 'running') {
      // Still locked... retry shortly after a gesture unlocks the context.
      timeoutId = window.setTimeout(() => {
        timeoutId = null
        if (!stopped) {
          void resumeAudioContext().then(() => {
            if (!stopped) playBurst()
          })
        }
      }, 400)
      return
    }

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

  void resumeAudioContext().then(() => {
    if (!stopped) playBurst()
  })

  if (kind === 'incoming' && typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([200, 100, 200, 100, 200, 1400])
    } catch {
      /* ignore */
    }
  }

  const handle = {
    stop() {
      if (stopped) return
      stopped = true
      activeHandles.delete(handle)
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
  activeHandles.add(handle)
  return handle
}

/** Start (or restart) the caller's waiting tone. Safe to call repeatedly. */
export function startOutgoingRingback() {
  stopOutgoingRingback()
  outgoingRingbackHandle = startChatCallTone('ringback')
  return outgoingRingbackHandle
}

export function stopOutgoingRingback() {
  stopChatCallTone(outgoingRingbackHandle)
  outgoingRingbackHandle = null
}

/** Stop all active ringtones globally */
export function stopAllChatCallTones() {
  outgoingRingbackHandle = null
  for (const h of activeHandles) {
    try {
      h.stop()
    } catch {
      /* ignore */
    }
  }
  activeHandles.clear()
}

/** @param {ChatCallToneHandle | null | undefined} handle */
export function stopChatCallTone(handle) {
  try {
    handle?.stop?.()
  } catch {
    /* ignore */
  }
}
