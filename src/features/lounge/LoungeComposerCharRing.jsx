/** Circular caption-length indicator (X-style ring + remaining count near max). */

export function loungeComposerCharRingStrokeClass(len, max) {
  const n = Math.max(0, Number(len) || 0)
  const cap = Math.max(1, Number(max) || 1)
  if (n >= cap) return 'stroke-red-500'
  if (n >= cap - 5) return 'stroke-orange-400'
  if (n >= cap - 15) return 'stroke-yellow-400'
  return 'stroke-cyan-500/70'
}

export function loungeComposerCharRingLabelClass(len, max) {
  const n = Math.max(0, Number(len) || 0)
  const cap = Math.max(1, Number(max) || 1)
  if (n >= cap) return 'text-red-500'
  if (n >= cap - 5) return 'text-orange-400'
  if (n >= cap - 15) return 'text-yellow-400'
  return 'text-zinc-500'
}

/**
 * @param {{
 *   len: number,
 *   max: number,
 *   showRemainingWithin?: number,
 *   size?: 'md' | 'lg',
 *   className?: string,
 *   'aria-live'?: string,
 * }} props
 */
export default function LoungeComposerCharRing({
  len,
  max,
  /** Show digits inside the ring when within this many chars of max. */
  showRemainingWithin = 15,
  size = 'md',
  className = '',
  'aria-live': ariaLive,
}) {
  const n = Math.max(0, Number(len) || 0)
  const cap = Math.max(1, Number(max) || 1)
  const isLg = size === 'lg'
  const box = isLg ? 36 : 28
  const r = isLg ? 11 : 8
  const stroke = isLg ? 2.35 : 2
  const c = 2 * Math.PI * r
  const pct = Math.min(1, n / cap)
  const offset = c * (1 - pct)
  const remaining = cap - n
  const showRemaining = remaining <= showRemainingWithin
  const mid = box / 2

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${isLg ? 'h-9 w-9' : 'h-7 w-7'} ${className}`.trim()}
      aria-label={`${n} of ${cap} characters`}
      aria-live={ariaLive}
      title={`${n}/${cap}`}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="-rotate-90" aria-hidden>
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          className="stroke-zinc-600/80"
          strokeWidth={stroke}
        />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          className={loungeComposerCharRingStrokeClass(n, cap)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.15s ease' }}
        />
      </svg>
      {showRemaining ? (
        <span
          className={`absolute font-bold tabular-nums leading-none ${isLg ? 'text-[11px]' : 'text-[9px]'} ${loungeComposerCharRingLabelClass(n, cap)}`}
        >
          {remaining}
        </span>
      ) : null}
    </div>
  )
}
