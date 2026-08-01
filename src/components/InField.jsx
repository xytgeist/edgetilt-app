/** Control chrome when the label lives inside the field (session / deal sheets). */
export const INFIELD_WRAP =
  'relative flex min-h-[3.35rem] flex-col justify-center rounded-2xl bg-zinc-800 px-3.5 py-1.5'

export const INFIELD_LABEL =
  'text-[9px] font-semibold uppercase tracking-wide leading-none text-zinc-500'

export const INFIELD_CONTROL =
  'w-full min-h-0 rounded-none border-0 bg-transparent px-0 text-sm font-semibold text-white outline-none focus:ring-0 placeholder:text-zinc-500'

export default function InField({ label, className = '', focusRingClass = '', children }) {
  return (
    <div
      className={`${INFIELD_WRAP} ${focusRingClass} ${className}`}
      data-in-field=""
    >
      <div className={INFIELD_LABEL}>{label}</div>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  )
}
