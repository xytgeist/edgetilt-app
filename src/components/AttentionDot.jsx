/**
 * Small red attention breadcrumb (no count). Parent should be `relative`.
 *
 * @param {{ className?: string }} props
 */
export default function AttentionDot({ className = '-right-0.5 -top-0.5' }) {
  return (
    <span
      data-attention-dot=""
      aria-hidden
      className={`pointer-events-none absolute z-[1] h-2.5 w-2.5 rounded-full bg-[#fd262d] ring-2 ring-zinc-950 ${className}`}
    />
  )
}
