import { ChevronLeft } from 'lucide-react'

/** Title bar "‹ Label" back control (same height and chrome as the title bar ☰ / × buttons). */
export default function TitleBarBackButton({ onClick, label, className = '' }) {
  if (!onClick || !label) return null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Back to ${label}`}
      data-title-bar-back
      className={`lounge-title-nav-btn inline-flex h-10 shrink-0 items-center gap-0.5 rounded-xl border border-zinc-700/60 bg-zinc-900 pl-1.5 pr-2.5 text-[13px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-800 ${className}`}
    >
      <ChevronLeft size={17} strokeWidth={2.5} aria-hidden />
      {label}
    </button>
  )
}
