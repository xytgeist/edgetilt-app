function appendSmoothSegments(d, coords) {
  if (coords.length < 2) return d
  if (coords.length === 2) {
    return `${d} L ${coords[1].x},${coords[1].y}`
  }
  let path = d
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] ?? coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return path
}

/** Catmull-Rom style smooth path through chart points. */
function buildSmoothLinePath(coords) {
  if (!coords.length) return ''
  return appendSmoothSegments(`M ${coords[0].x},${coords[0].y}`, coords)
}

function buildSmoothFillPath(coords, bottomY) {
  if (coords.length < 2) return ''
  const first = coords[0]
  const last = coords[coords.length - 1]
  return `${appendSmoothSegments(`M ${first.x},${bottomY} L ${first.x},${first.y}`, coords)} L ${last.x},${bottomY} Z`
}

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
  const linePath = buildSmoothLinePath(coords)
  const fillPath = showFill ? buildSmoothFillPath(coords, h) : ''
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
        <path d={fillPath} className={fillClassName || 'fill-current opacity-[0.14]'} />
      ) : null}
      <path
        fill="none"
        stroke={strokeClassName ? undefined : 'currentColor'}
        strokeWidth={showFill ? '1' : '2.25'}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={linePath}
        vectorEffect="non-scaling-stroke"
        className={strokeClassName || (showFill ? 'opacity-20' : undefined)}
      />
    </svg>
  )
}