/** Tiny SVG bankroll trajectory. */
export default function BankrollSparkline({
  series,
  className = '',
  upClass = 'text-emerald-400',
  downClass = 'text-rose-400',
  /** Filled area under the line (for card backgrounds). */
  showFill = false,
  strokeClassName = '',
  fillClassName = '',
}) {
  if (!series || series.length < 2) return null
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const padY = 4
  const h = 40
  const w = 100
  const coords = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w
    const y = padY + (1 - (v - min) / span) * (h - padY * 2)
    return { x, y }
  })
  const points = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const fillPoints = [
    `${coords[0].x},${h}`,
    ...coords.map((c) => `${c.x},${c.y}`),
    `${coords[coords.length - 1].x},${h}`,
  ].join(' ')
  const up = series[series.length - 1] >= series[0]
  const toneClass = up ? upClass : downClass
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`${className} ${toneClass}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {showFill ? (
        <polygon
          points={fillPoints}
          className={fillClassName || 'fill-current opacity-[0.14]'}
        />
      ) : null}
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={showFill ? '1.75' : '2.25'}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        vectorEffect="non-scaling-stroke"
        className={strokeClassName || (showFill ? 'opacity-35' : undefined)}
      />
    </svg>
  )
}
