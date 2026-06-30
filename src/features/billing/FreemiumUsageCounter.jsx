/**
 * @param {number | null | undefined} remaining
 * @param {number} limit
 * @param {string} itemLabelPlural e.g. "sessions", "play logs"
 */
export function formatFreemiumUsageLabel(remaining, limit, itemLabelPlural) {
  if (remaining == null) return null
  if (remaining <= 0) {
    return `0 of ${limit} free ${itemLabelPlural} remaining — subscribe for unlimited`
  }
  return `${remaining} of ${limit} free ${itemLabelPlural} remaining`
}

/**
 * @param {{
 *   remaining?: number | null,
 *   limit: number,
 *   itemLabelPlural?: string,
 *   loading?: boolean,
 *   className?: string,
 *   compact?: boolean,
 * }} props
 */
export default function FreemiumUsageCounter({
  remaining = null,
  limit,
  itemLabelPlural = 'uses',
  loading = false,
  className = '',
  compact = false,
}) {
  if (remaining == null) return null

  const label = formatFreemiumUsageLabel(remaining, limit, itemLabelPlural)

  return (
    <p
      className={`text-center text-xs tabular-nums ${
        compact ? 'mt-1.5' : 'mb-2'
      } ${
        remaining <= 0 ? 'text-amber-300/90' : 'text-zinc-400'
      } ${className}`}
      data-freemium-usage-counter
      data-freemium-usage-remaining={String(remaining)}
    >
      {loading ? 'Checking free tier usage…' : label}
    </p>
  )
}
