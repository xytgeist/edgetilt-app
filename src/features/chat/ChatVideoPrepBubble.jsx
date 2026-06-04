/**
 * ChatVideoPrepBubble — looks exactly like a sent video chat bubble while a
 * video is being trimmed / encoded / uploaded locally.
 *
 * Shell mirrors ChatBubble's "isMine + isGroupEnd + hasMedia" path:
 *   row flex-row-reverse → column max-w-[78%] items-end →
 *   bubble chat-bubble-surface p-[3px] rounded-2xl blue →
 *   media tile rounded-[13px] aspectRatio 1/1 minWidth 160 →
 *   blue tail SVG bottom-right
 */

const BUBBLE_EXPANDED_RADIUS_PX = 16

/**
 * European roulette pocket colours in wheel order (37 pockets).
 * green = 0, then alternating red/black in the standard sequence.
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
 * Spinning roulette wheel + circular SVG progress arc + white ball at tip.
 *
 * @param {{ progress: number, status: string }} props
 */
function RouletteProgressRing({ progress, status }) {
  const SIZE = 110
  const STROKE = 4.5
  const r = SIZE / 2 - STROKE / 2 - 1
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)))

  // White ball position along the arc (starts at top, clockwise)
  const angle = progress * 2 * Math.PI - Math.PI / 2
  const ballX = SIZE / 2 + r * Math.cos(angle)
  const ballY = SIZE / 2 + r * Math.sin(angle)

  const label =
    status === 'trimming' ? 'Trimming'
    : status === 'encoding' ? 'Encoding'
    : status === 'uploading' ? 'Uploading'
    : status === 'sending' ? 'Sending'
    : ''
  const pct = `${Math.round(progress * 100)}%`

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* SVG: track + progress arc (rendered without CSS rotation so ball coords are correct) */}
        <svg
          width={SIZE}
          height={SIZE}
          className="absolute inset-0"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
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

        {/* White ball at arc tip — positioned in un-rotated space */}
        {progress > 0.01 && (
          <div
            className="absolute rounded-full bg-white"
            style={{
              width: 8,
              height: 8,
              left: ballX - 4,
              top: ballY - 4,
              boxShadow: '0 0 4px 1px rgba(255,255,255,0.75)',
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
            boxShadow: 'inset 0 0 8px rgba(0,0,0,0.65), 0 0 6px rgba(0,0,0,0.5)',
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
  const { status, progress, posterUrl, errorMessage } = job
  const isError = status === 'error'

  // borderRadius matches ChatBubble "isMine + isGroupEnd": 16 16 0 16
  const r = BUBBLE_EXPANDED_RADIUS_PX
  const bubbleRadius = `${r}px ${r}px 0px ${r}px`

  return (
    /* Row — mirrors ChatBubble's outer row for a sent (isMine) message */
    <div className="flex items-end gap-2 flex-row-reverse px-3">

      {/* Column — same max-w-[78%] + items-end as ChatBubble */}
      <div className="flex max-w-[78%] flex-col gap-1 items-end">

        {/* Bubble surface — exactly mirrors the blue p-[3px] media bubble */}
        <div
          className="chat-bubble-surface relative select-none text-[16px] leading-snug p-[3px] text-white"
          style={{
            backgroundColor: '#3b82f6',
            borderRadius: bubbleRadius,
          }}
        >
          {/* Media tile — same rounded-[13px] aspect-square minWidth as ChatMediaGrid */}
          <div
            className="relative overflow-hidden bg-zinc-900 rounded-[13px]"
            style={{ aspectRatio: '1 / 1', minWidth: 160 }}
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

            {/* X cancel button — top-right, always visible while active */}
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

          {/* Blue send-tail — bottom-right, same as ChatBubble isMine isGroupEnd */}
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
