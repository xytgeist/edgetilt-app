/** Lounge post row / sheet: signed-out users see counts only (no local toggle state). */
export default function LoungeFeedStatSlot({ readOnly, onClick, className, title, children }) {
  if (readOnly) {
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
