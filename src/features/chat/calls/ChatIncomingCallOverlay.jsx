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
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-gradient-to-b from-zinc-950 via-[#0a1018] to-zinc-950 px-6 text-center"
      data-chat-feature
      data-chat-call-incoming
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
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 20%, rgba(6,182,212,0.12) 0%, transparent 60%), radial-gradient(circle at 50% 80%, rgba(59,130,246,0.08) 0%, transparent 60%)',
        }}
        aria-hidden
      />

      <div className="relative z-[1] flex flex-col items-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-cyan-300 drop-shadow-sm">
          {isVideo ? 'Video call' : 'Voice call'}
        </p>
        <div className="mt-8 flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-zinc-800 shadow-[0_20px_50px_rgba(0,0,0,0.65)] ring-2 ring-white/15 backdrop-blur-md">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover rounded-full" />
          ) : (
            <span className="text-[44px] font-bold uppercase tracking-tight text-zinc-100" aria-hidden>
              {(title || '?').trim().charAt(0) || '?'}
            </span>
          )}
        </div>
        <h2 className="mt-5 max-w-sm text-[28px] font-bold tracking-tight text-white drop-shadow-sm">{title}</h2>
        <p className="mt-1.5 font-mono text-[14px] text-zinc-300/90">{subtitle}</p>
        {busy ? (
          <p className="mt-6 text-[13px] font-semibold text-cyan-400 animate-pulse" role="status">
            Connecting…
          </p>
        ) : (
          <p className="mt-6 max-w-xs text-[12px] leading-relaxed text-zinc-400">
            Keep Edge open during calls.
          </p>
        )}

        {showDeclineQuickReplies ? (
          <div className="mt-6 w-full max-w-sm text-left">
            <select
              id="chat-call-decline-quick-reply"
              aria-label="Quick reply"
              value={quickReply}
              disabled={busy}
              onChange={(event) => setQuickReply(event.target.value)}
              className="w-full min-h-12 appearance-none rounded-2xl border border-white/15 bg-zinc-900/80 px-4 pr-10 text-[14px] font-medium text-zinc-100 backdrop-blur-md touch-manipulation disabled:opacity-50"
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
                className="mt-3 w-full min-h-12 rounded-2xl border border-rose-500/40 bg-rose-600/90 px-4 text-[14px] font-bold text-white shadow-lg backdrop-blur-md touch-manipulation active:scale-98 transition-all disabled:opacity-50"
              >
                Decline & send
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={`flex items-center justify-center ${showDeclineQuickReplies ? 'mt-8' : 'mt-10'}`}
          style={{ gap: '4.5rem' }}
        >
          <div className="flex flex-col items-center">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                stopToneNow()
                onDecline()
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white shadow-[0_8px_24px_rgba(225,29,72,0.45)] touch-manipulation active:scale-95 transition-all disabled:opacity-50"
              aria-label="Decline call"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="mt-2 text-[11px] font-medium tracking-tight text-zinc-300 text-center select-none">
              Decline
            </span>
          </div>
          <div className="flex flex-col items-center">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                // Stop before Accept unlocks audio... otherwise you get a half-second ring blip.
                stopToneNow()
                onAccept()
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-[0_8px_24px_rgba(16,185,129,0.45)] font-bold touch-manipulation active:scale-95 transition-all disabled:opacity-50"
              aria-label="Accept call"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
              </svg>
            </button>
            <span className="mt-2 text-[11px] font-medium tracking-tight text-zinc-300 text-center select-none">
              Accept
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
