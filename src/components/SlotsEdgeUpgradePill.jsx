import NavLockGlyph from './NavLockGlyph.jsx'

/** Compact CTA for Starter subscribers hitting Full Edge gates. */
export default function SlotsEdgeUpgradePill({ className = '' }) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/15 py-0.5 pl-2.5 pr-2 text-[10px] font-bold uppercase tracking-wide text-cyan-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Upgrade
      <NavLockGlyph className="h-3 w-3 shrink-0 text-cyan-100/95" />
    </span>
  )
}
