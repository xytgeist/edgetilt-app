/**
 * Short Web Audio cues for call recording start / stop / countdown warnings.
 * Separate from ring/ringback so recording never reuses the ringtone.
 */

import { unlockChatCallAudio } from './chatCallRingTone.js'

/**
 * @param {'started' | 'stopped' | 'warn_60' | 'warn_15'} kind
 */
export function playChatCallRecordingCue(kind) {
  if (typeof window === 'undefined') return
  try {
    unlockChatCallAudio()
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    const beep = (t0, freq, dur, peak = 0.12) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.connect(g)
      g.connect(gain)
      osc.start(t0)
      osc.stop(t0 + dur + 0.02)
    }

    if (kind === 'started') {
      beep(now, 880, 0.12, 0.1)
      beep(now + 0.14, 1175, 0.14, 0.1)
    } else if (kind === 'stopped') {
      beep(now, 660, 0.16, 0.09)
      beep(now + 0.12, 440, 0.18, 0.08)
    } else if (kind === 'warn_60') {
      beep(now, 740, 0.1, 0.11)
      beep(now + 0.16, 740, 0.1, 0.11)
    } else if (kind === 'warn_15') {
      beep(now, 980, 0.08, 0.12)
      beep(now + 0.12, 980, 0.08, 0.12)
      beep(now + 0.24, 980, 0.1, 0.12)
    }

    window.setTimeout(() => {
      try {
        void ctx.close()
      } catch {
        /* ignore */
      }
    }, 800)
  } catch {
    /* autoplay / unsupported */
  }
}
