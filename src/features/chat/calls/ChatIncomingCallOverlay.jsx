import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { startChatCallTone, stopChatCallTone, unlockChatCallAudio } from './chatCallRingTone.js'

/**
 * Full-screen incoming call UI (DM ring or group voice invite).
 * @param {{
 *   open: boolean,
 *   title: string,
 *   subtitle?: string,
 *   isVideo?: boolean,
 *   busy?: boolean,
 *   onAccept: () => void,
 *   onDecline: () => void,
 * }} props
 */
export default function ChatIncomingCallOverlay({
  open,
  title,
  subtitle = 'Incoming call',
  isVideo = false,
  busy = false,
  onAccept,
  onDecline,
}) {
  const toneRef = useRef(/** @type {{ stop: () => void } | null} */ (null))

  useEffect(() => {
    if (!open) {
      stopChatCallTone(toneRef.current)
      toneRef.current = null
      return undefined
    }

    stopChatCallTone(toneRef.current)
    toneRef.current = startChatCallTone('incoming')

    // If audio was still locked, a later unlock (app tap / mic) should restart the tone.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      unlockChatCallAudio()
      if (!toneRef.current) {
        toneRef.current = startChatCallTone('incoming')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stopChatCallTone(toneRef.current)
      toneRef.current = null
    }
  }, [open])

  const stopToneNow = () => {
    stopChatCallTone(toneRef.current)
    toneRef.current = null
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-zinc-950/95 px-6 text-center"
      data-chat-feature
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call"
      onPointerDown={(event) => {
        // Unlock autoplay. Restart tone only for non-button taps (Accept/Decline stop their own tone).
        unlockChatCallAudio()
        if (event.target instanceof Element && event.target.closest('button')) return
        stopChatCallTone(toneRef.current)
        toneRef.current = startChatCallTone('incoming')
      }}
    >
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-cyan-400/90">
        {isVideo ? 'Video call' : 'Voice call'}
      </p>
      <h2 className="mt-3 max-w-sm text-[28px] font-black tracking-tight text-zinc-50">{title}</h2>
      <p className="mt-2 text-[15px] text-zinc-400">{subtitle}</p>
      <p className="mt-8 max-w-xs text-[12px] leading-relaxed text-zinc-500">
        Keep Edge open during calls. Background audio on iPhone is best-effort.
      </p>
      <div className="mt-12 flex items-center gap-10">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            stopToneNow()
            onDecline()
          }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white touch-manipulation active:opacity-80 disabled:opacity-50"
          aria-label="Decline call"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            // Stop before Accept unlocks audio... otherwise you get a half-second ring blip.
            stopToneNow()
            onAccept()
          }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 touch-manipulation active:opacity-80 disabled:opacity-50"
          aria-label="Accept call"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}
