import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHAT_CALL_DECLINE_QUICK_REPLIES } from './chatCallDeclineQuickReplies.js'
import { startChatCallTone, stopChatCallTone, unlockChatCallAudio } from './chatCallRingTone.js'

/**
 * Full-screen incoming call UI (DM ring or group voice invite).
 * @param {{
 *   open: boolean,
 *   title: string,
 *   avatarUrl?: string | null,
 *   subtitle?: string,
 *   isVideo?: boolean,
 *   busy?: boolean,
 *   showDeclineQuickReplies?: boolean,
 *   onAccept: () => void,
 *   onDecline: () => void,
 *   onDeclineWithMessage?: (message: string) => void,
 * }} props
 */
export default function ChatIncomingCallOverlay({
  open,
  title,
  avatarUrl = null,
  subtitle = 'Incoming call',
  isVideo = false,
  busy = false,
  showDeclineQuickReplies = false,
  onAccept,
  onDecline,
  onDeclineWithMessage,
}) {
  const toneRef = useRef(/** @type {{ stop: () => void } | null} */ (null))
  const [quickReply, setQuickReply] = useState('')

  useEffect(() => {
    if (!open) {
      setQuickReply('')
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

  const canSendQuickReply =
    showDeclineQuickReplies && Boolean(quickReply) && typeof onDeclineWithMessage === 'function'

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
        if (event.target instanceof Element && event.target.closest('button, select, label')) return
        stopChatCallTone(toneRef.current)
        toneRef.current = startChatCallTone('incoming')
      }}
    >
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-cyan-400/90">
        {isVideo ? 'Video call' : 'Voice call'}
      </p>
      <div className="mt-6 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 shadow-[0_0_0_4px_rgba(24,24,27,0.65)]">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[36px] font-black uppercase tracking-tight text-zinc-300" aria-hidden>
            {(title || '?').trim().charAt(0) || '?'}
          </span>
        )}
      </div>
      <h2 className="mt-4 max-w-sm text-[28px] font-black tracking-tight text-zinc-50">{title}</h2>
      <p className="mt-2 text-[15px] text-zinc-400">{subtitle}</p>
      <p className="mt-8 max-w-xs text-[12px] leading-relaxed text-zinc-500">
        Keep Edge open during calls. Background audio on iPhone is best-effort.
      </p>

      {showDeclineQuickReplies ? (
        <div className="mt-8 w-full max-w-sm text-left">
          <label htmlFor="chat-call-decline-quick-reply" className="block text-[12px] font-semibold text-zinc-400">
            Quick reply (optional)
          </label>
          <select
            id="chat-call-decline-quick-reply"
            value={quickReply}
            disabled={busy}
            onChange={(event) => setQuickReply(event.target.value)}
            className="mt-2 w-full min-h-12 appearance-none rounded-2xl border border-zinc-700 bg-zinc-900 px-4 pr-10 text-[15px] font-medium text-zinc-100 touch-manipulation disabled:opacity-50"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2.2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.9rem center',
            }}
          >
            <option value="">Decline without a message</option>
            {CHAT_CALL_DECLINE_QUICK_REPLIES.map((text) => (
              <option key={text} value={text}>
                {text}
              </option>
            ))}
          </select>
          {canSendQuickReply ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                stopToneNow()
                onDeclineWithMessage?.(quickReply)
              }}
              className="mt-3 w-full min-h-12 rounded-2xl border border-rose-500/50 bg-rose-600/90 px-4 text-[15px] font-bold text-white touch-manipulation active:opacity-80 disabled:opacity-50"
            >
              Decline & send
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`flex items-center gap-10${showDeclineQuickReplies ? ' mt-10' : ' mt-12'}`}>
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
