/** Tiny SVG bankroll trajectory. */
export default function BankrollSparkline({
  series,
  className = '',
  upClass = 'text-emerald-400',
  downClass = 'text-rose-400',
}) {
  if (!series || series.length < 2) return null
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const padY = 4
  const h = 40
  const w = 100
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w
      const y = padY + (1 - (v - min) / span) * (h - padY * 2)
      return `${x},${y}`
    })
    .join(' ')
  const up = series[series.length - 1] >= series[0]
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`${className} ${up ? upClass : downClass}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
