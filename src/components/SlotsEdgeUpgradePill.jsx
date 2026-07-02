/** Compact CTA for Starter subscribers hitting Full Edge gates. */
export default function SlotsEdgeUpgradePill({ className = '' }) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Upgrade
    </span>
  )
}
