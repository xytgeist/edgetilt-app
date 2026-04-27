/**
 * Human-readable denomination for UI (e.g. 0.1 → "0.10", 1 → "1").
 */
export function formatDenomLabel(d) {
  if (!Number.isFinite(d)) return String(d)
  if (d > 0 && d < 1) return d.toFixed(2)
  if (Number.isInteger(d) || Math.abs(d - Math.trunc(d)) < 1e-9) return String(Math.trunc(d))
  return String(d)
}
