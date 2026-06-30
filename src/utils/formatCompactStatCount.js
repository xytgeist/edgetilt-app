/**
 * Short stat labels for Lounge post actions (comment / repost / like counts) and similar UI.
 * 0–999: full integer. 1000+: truncated one-decimal suffix (e.g. 1456 → "1.4K", 1_200_000 → "1.2M").
 *
 * @param {number} n
 * @returns {string}
 */
export function formatCompactStatCount(n) {
  if (!Number.isFinite(n) || n < 0) return '0'
  const t = Math.trunc(n)
  if (t < 1000) return String(t)

  const trunc1 = (v) => Math.trunc(v * 10) / 10
  const fmt = (divisor, suffix) => {
    const x = trunc1(t / divisor)
    const base = x % 1 === 0 ? String(x) : x.toFixed(1)
    return `${base.replace(/\.0$/, '')}${suffix}`
  }

  if (t < 1_000_000) return fmt(1000, 'K')
  if (t < 1_000_000_000) return fmt(1_000_000, 'M')
  return fmt(1_000_000_000, 'B')
}

/** `title` / tooltip text when the shown label is abbreviated (1000+). */
export function fullStatCountTitle(n) {
  if (!Number.isFinite(n) || n < 1000) return undefined
  return Math.trunc(n).toLocaleString()
}

/**
 * Per-stat **inner** grid: fixed icon track + `6ch` count track so glyphs do not move when a count
 * appears (used where a compact icon+count cell is needed). The feed/post **interaction** row instead
 * uses **`justify-between`** on four fixed-width glyph rails - see **`LoungeInteractionGlyphRail.jsx`**
 * and **`LoungePostInteractionBar.jsx`** - with counts `absolute` so they do not affect inter-icon gaps.
 */
export const loungeInteractionStatGridClass =
  'inline-grid shrink-0 items-center justify-items-start gap-x-1.5 self-center'

/** Second column: count text (hidden at zero but cell kept). */
export const loungeInteractionStatCountCellClass =
  'min-w-0 self-center text-left tabular-nums leading-none'

/**
 * @param {'feed' | 'sheet'} variant
 * @returns {string} CSS `grid-template-columns` value
 */
export function loungeInteractionStatGridTemplateColumns(variant) {
  return variant === 'sheet' ? '24px 6ch' : '22px 6ch'
}
