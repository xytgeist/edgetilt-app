import { useMemo } from 'react'

/**
 * European roulette pocket colours in wheel order (37 pockets, 0–36).
 * green = 0, then alternating red/black in the standard wheel sequence.
 */
const ROULETTE_ORDER = [
  '#16a34a', // 0  — green
  '#dc2626', // 32 — red
  '#18181b', // 15 — black
  '#dc2626', // 19 — red
  '#18181b', // 4  — black
  '#dc2626', // 21 — red
  '#18181b', // 2  — black
  '#dc2626', // 25 — red
  '#18181b', // 17 — black
  '#dc2626', // 34 — red
  '#18181b', // 6  — black
  '#dc2626', // 27 — red
  '#18181b', // 13 — black
  '#dc2626', // 36 — red
  '#18181b', // 11 — black
  '#dc2626', // 30 — red
  '#18181b', // 8  — black
  '#dc2626', // 23 — red
  '#18181b', // 10 — black
  '#dc2626', // 5  — red
  '#18181b', // 24 — black
  '#dc2626', // 16 — red
  '#18181b', // 33 — black
  '#dc2626', // 1  — red
  '#18181b', // 20 — black
  '#dc2626', // 14 — red
  '#18181b', // 31 — black
  '#dc2626', // 9  — red
  '#18181b', // 22 — black
  '#dc2626', // 18 — red
  '#18181b', // 29 — black
  '#dc2626', // 7  — red
  '#18181b', // 28 — black
  '#dc2626', // 12 — red
  '#18181b', // 35 — black
  '#dc2626', // 3  — red
  '#18181b', // 26 — black
]

const SEG_DEG = 360 / ROULETTE_ORDER.length
const ROULETTE_GRADIENT = `conic-gradient(${ROULETTE_ORDER.map((c, i) => {
  const s = (i * SEG_DEG).toFixed(3)
  const e = ((i + 1) * SEG_DEG).toFixed(3)
  return `${c} ${s}deg ${e}deg`
}).join(', ')})`

/**
 * Spinning roulette wheel + circular progress arc.
 *
 * @param {{ progress: number, status: string }} props
 */
function RouletteProgressRing({ progress, status }) {
  const SIZE = 116
  const STROKE = 5
  const r = SIZE / 2 - STROKE / 2 - 1
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)))

  // White ball position along the arc (starts at top, clockwise)
  const angle = progress * 2 * Math.PI - Math.PI / 2
  const ballX = SIZE / 2 + r * Math.cos(angle)
  const ballY = SIZE / 2 + r * Math.sin(angle)

  // Status label — short version for the overlay
  const label = status === 'trimming' ? 'Trimming' : status === 'encoding' ? 'Encoding' : status === 'uploading' ? 'Uploading' : status === 'sending' ? 'Sending' : ''
  const pct = `${Math.round(progress * 100)}%`

  return (
    <div className="relative flex flex-col items-center justify-center gap-1">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* SVG: track + progress arc + ball */}
        <svg
          width={SIZE}
          height={SIZE}
          className="absolute inset-0"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track ring */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={STROKE}
          />
          {/* Progress arc */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.35s ease' }}
          />
        </svg>
        {/* White ball at arc tip (rendered un-rotated via inline transform) */}
        {progress > 0.01 && (
          <div
            className="absolute rounded-full bg-white shadow"
            style={{
              width: 9,
              height: 9,
              left: ballX - 4.5,
              top: ballY - 4.5,
              boxShadow: '0 0 4px 1px rgba(255,255,255,0.7)',
            }}
          />
        )}
        {/* Spinning roulette wheel */}
        <div
          className="absolute"
          style={{
            inset: STROKE + 3,
            borderRadius: '50%',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 8px rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.4)',
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              background: ROULETTE_GRADIENT,
              animation: 'chat-roulette-spin 2.4s linear infinite',
            }}
          />
          {/* Centre hub */}
          <div
            className="absolute rounded-full bg-zinc-900"
            style={{ inset: '30%', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.8)' }}
          />
        </div>
      </div>

      {/* Label + % */}
      {label && (
        <div className="text-center text-[11px] font-semibold text-white/80 drop-shadow">
          {label} {pct}
        </div>
      )}
    </div>
  )
}

/**
 * A fake sent-message bubble that lives in the chat timeline while a video is
 * being trimmed / encoded / uploaded.  Only the sender sees it — the message
 * is not actually inserted on the server until processing is complete.
 *
 * @param {{
 *   job: {
 *     jobId: string,
 *     status: 'pending'|'trimming'|'encoding'|'uploading'|'sending'|'done'|'error',
 *     progress: number,
 *     posterUrl: string | null,
 *     width: number | null,
 *     height: number | null,
 *     errorMessage: string | null,
 *   },
 *   onCancel: () => void,
 *   onRetry: () => void,
 * }} props
 */
export default function ChatVideoPrepBubble({ job, onCancel, onRetry }) {
  const { status, progress, posterUrl, width, height, errorMessage } = job

  // Compute bubble aspect ratio — default 16:9 if no dims available
  const aspect = useMemo(() => {
    if (width && height && height > 0) return width / height
    return 16 / 9
  }, [width, height])

  const isError = status === 'error'
  const isActive = !isError

  // Bubble width (matches max-w-[78%] approx — use a fixed pixel width here)
  const BUBBLE_W = 220

  return (
    <div className="flex items-end justify-end px-3">
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          width: BUBBLE_W,
          height: Math.round(BUBBLE_W / aspect),
          backgroundColor: '#3b82f6',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Poster image (or dark placeholder) */}
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-900" />
        )}

        {/* Dark scrim so overlay is readable */}
        <div className="absolute inset-0 bg-black/50" />

        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RouletteProgressRing progress={progress} status={status} />
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3">
            <div className="text-center text-[12px] font-semibold leading-snug text-white/90">
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

        {/* X cancel button — top-right, always visible while active */}
        {isActive && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel video"
            className="absolute right-2 top-2 flex h-7 w-7 touch-manipulation items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm hover:bg-black/70 [-webkit-tap-highlight-color:transparent]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        )}
      </div>

      {/* Blue send-tail (bottom-right, same as ChatBubble sent messages) */}
      <svg
        className="pointer-events-none absolute"
        style={{ right: 12, bottom: 0 }}
        width="8" height="8" viewBox="0 0 8 8" fill="none"
      >
        <path d="M8 8 Q8 0 0 0 L8 0 Z" fill="#3b82f6" />
      </svg>
    </div>
  )
}
