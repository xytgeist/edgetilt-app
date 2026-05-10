/**
 * Lounge post row / sheet: when `readOnly`, taps can still open auth via `onReadOnlyClick`
 * instead of toggling local interaction state.
 */
export default function LoungeFeedStatSlot({ readOnly, onClick, onReadOnlyClick, className, title, children }) {
  if (readOnly) {
    if (typeof onReadOnlyClick === 'function') {
      return (
        <button type="button" onClick={onReadOnlyClick} className={className} title={title}>
          {children}
        </button>
      )
    }
    return (
      <span className={`${className} cursor-default select-none`} title={title}>
        {children}
      </span>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className} title={title}>
      {children}
    </button>
  )
}
