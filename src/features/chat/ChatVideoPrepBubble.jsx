import { useRef } from 'react'
import {
  CHAT_ROULETTE_RING_C,
  useChatRouletteChaseAnimation,
} from './chatRouletteChasingArc.js'
import {
  CHAT_MESSAGE_COLUMN_WIDTH_CLASS,
  chatVideoTileStyle,
} from './chatVideoTileLayout.js'

/**
 * ChatVideoPrepBubble - looks exactly like a sent video chat bubble while a
 * video is being trimmed / encoded / uploaded locally.
 *
 * Shell mirrors ChatBubble's "isMine + isGroupEnd + single video" path:
 *   row flex-row-reverse → column w-[78%] items-end →
 *   bubble chat-bubble-surface p-[3px] rounded-2xl blue →
 *   media tile rounded-[13px] w-full + encoded aspect →
 *   blue tail SVG bottom-right
 */

const BUBBLE_EXPANDED_RADIUS_PX = 16

// Matches the tuned constants from the original VideoUploadRing.
// Pre-cropped wheel disc (public/roulette-spinner.png). 65 px + cover ≈ flush with ring.
const RING_R = 36
const WHEEL_IMG_PX = 65
const RING_C = CHAT_ROULETTE_RING_C

/**
 * Two-lap chasing arc: head/tail always roll forward; long stretch through lap 1,
 * tail catch-up on lap 2. Ball rides the head + spinning roulette wheel.
 *
 * @param {{ progress: number, status: string }} props
 */
function RouletteProgressRing({ progress, status }) {
  const arcRef = useRef(null)
  const ballArmRef = useRef(null)
  useChatRouletteChaseAnimation(arcRef, ballArmRef)

  const label =
    status === 'trimming'  ? 'Trimming'
    : status === 'encoding'  ? 'Encoding'
    : status === 'uploading' ? 'Uploading'
    : status === 'sending'   ? 'Sending'
    : ''

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Ring + wheel share a 100×100 container */}
      <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
        {/* Faint track behind the wheel */}
        <svg
          width="100"
          height="100"
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 z-0 overflow-visible"
          aria-hidden
        >
          <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.5" />
        </svg>

        {/* Spinning roulette wheel - pre-cropped square asset */}
        <img
          src="/roulette-spinner.png"
          alt=""
          className="relative z-10 rounded-full"
          style={{
            width: WHEEL_IMG_PX,
            height: WHEEL_IMG_PX,
            objectFit: 'cover',
            animation: 'chat-roulette-spin 4.5s linear infinite',
          }}
        />

        {/* Orbiting arc + ball above the wheel (-rotate-90 → arc starts at 12 o'clock) */}
        <svg
          width="100"
          height="100"
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 z-20 -rotate-90 overflow-visible"
          aria-hidden
        >
          <g>
            <circle
              ref={arcRef}
              cx="50"
              cy="50"
              r={RING_R}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${RING_C * (14 / 360)} ${RING_C}`}
              strokeDashoffset={0}
            />
            <g ref={ballArmRef} transform="rotate(0 50 50)">
              <circle
                cx={50 + RING_R}
                cy={50}
                r={5}
                fill="white"
                stroke="rgba(0,0,0,0.45)"
                strokeWidth={0.75}
                style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.9))' }}
              />
            </g>
          </g>
        </svg>
      </div>

      {/* Status + percentage */}
      <span
        className="font-bold tabular-nums text-white"
        style={{ fontSize: 13, lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
      >
        {label ? `${label} ` : ''}{Math.round(Math.max(0, Math.min(1, progress)) * 100)}%
      </span>
    </div>
  )
}

/**
 * @param {{
 *   job: {
 *     jobId: string,
 *     status: 'pending'|'trimming'|'encoding'|'uploading'|'sending'|'done'|'error',
 *     progress: number,
 *     posterUrl: string | null,
 *     errorMessage: string | null,
 *   },
 *   onCancel: () => void,
 *   onRetry: () => void,
 * }} props
 */
export default function ChatVideoPrepBubble({ job, onCancel, onRetry }) {
  const { status, progress, posterUrl, width, height, errorMessage } = job
  const isError = status === 'error'
  const tileStyle = chatVideoTileStyle({ width, height })

  // borderRadius matches ChatBubble "isMine + isGroupEnd": 16 16 0 16
  const r = BUBBLE_EXPANDED_RADIUS_PX
  const bubbleRadius = `${r}px ${r}px 0px ${r}px`

  return (
    /* Row - mirrors ChatBubble's outer row for a sent (isMine) message */
    <div className="flex items-end gap-2 flex-row-reverse">

      {/* Column - same 78% width cap as a delivered single-video bubble */}
      <div className={`flex flex-col gap-1 items-end ${CHAT_MESSAGE_COLUMN_WIDTH_CLASS}`}>

        {/* Bubble surface - exactly mirrors the blue p-[3px] media bubble */}
        <div
          className="chat-bubble-surface relative w-full select-none text-[16px] leading-snug p-[3px] text-white"
          style={{
            backgroundColor: '#3b82f6',
            borderRadius: bubbleRadius,
          }}
        >
          {/* Media tile - same rounded-[13px] size as delivered ChatMediaGrid video */}
          <div
            className="relative overflow-hidden bg-zinc-900 rounded-[13px]"
            style={tileStyle}
          >
            {/* Poster (or dark placeholder) */}
            {posterUrl ? (
              <img
                src={posterUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 bg-zinc-800" />
            )}

            {/* Dark scrim */}
            <div className="absolute inset-0 bg-black/45" />

            {/* Roulette progress ring (active) */}
            {!isError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <RouletteProgressRing progress={progress} status={status} />
              </div>
            )}

            {/* Error overlay */}
            {isError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3">
                <div className="text-center text-[12px] font-semibold leading-snug text-white/90 drop-shadow">
                  {errorMessage || 'Upload failed.'}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-full bg-white/20 px-3.5 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm touch-manipulation hover:bg-white/30"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-bold text-white/70 backdrop-blur-sm touch-manipulation hover:bg-white/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* X cancel button - top-right, always visible while active */}
            {!isError && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel video"
                className="absolute right-2 top-2 flex h-7 w-7 touch-manipulation items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm hover:bg-black/70 [-webkit-tap-highlight-color:transparent]"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="11" y2="11" />
                  <line x1="11" y1="1" x2="1" y2="11" />
                </svg>
              </button>
            )}
          </div>

          {/* Blue send-tail - bottom-right, same as ChatBubble isMine isGroupEnd */}
          <svg
            className="absolute pointer-events-none"
            style={{ bottom: 0, right: 0, overflow: 'visible', width: 12, height: 12 }}
            aria-hidden
          >
            <path d="M12 12 L12 0 Q12 12 24 12 Z" fill="#3b82f6" />
          </svg>
        </div>
      </div>
    </div>
  )
}
