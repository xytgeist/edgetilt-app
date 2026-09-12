/**
 * Safe-area plate above the EDGE title bar.
 * Fades to opaque as the title hides (scroll up) and fades out as it returns (scroll down),
 * so the Island / clock stay on a solid cap instead of sliding chrome.
 *
 * @param {number} reveal - 1 = title shown, 0 = title hidden
 * @param {number} heightPx - status-bar / `--edge-sat` height
 * @param {'fixed' | 'absolute'} [position='fixed']
 * @param {string} [className]
 */
export default function EdgeStatusBarScrollPlate({
  reveal = 1,
  heightPx = 0,
  position = 'fixed',
  className = '',
}) {
  const h = Math.max(0, Number(heightPx) || 0)
  if (h <= 0) return null
  const r = Math.min(1, Math.max(0, Number(reveal) || 0))
  const placed = position === 'absolute' ? 'absolute left-0 right-0' : 'fixed left-1/2 -translate-x-1/2'
  return (
    <div
      aria-hidden
      data-edge-status-bar-plate
      className={`${placed} pointer-events-none z-[51] w-full ${className}`.trim()}
      style={{
        top: 0,
        height: h,
        opacity: 1 - r,
      }}
    />
  )
}
