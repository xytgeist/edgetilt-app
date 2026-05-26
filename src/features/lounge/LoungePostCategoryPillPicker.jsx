import {
  loungePostCategoryPillChipClass,
  loungePostCategoryPillOptions,
  normalizeLoungePostCategoryPills,
  normalizeLoungeProfileCategoryPills,
} from '../../utils/loungePostCategoryPills.js'

const DEFAULT_MAX_PILLS = 3

/** Toggle chips for compose / quote / post edit (0–3 optional) or profile interests (uncapped). */
export default function LoungePostCategoryPillPicker({
  value,
  onChange,
  disabled = false,
  maxPills = DEFAULT_MAX_PILLS,
  hint = 'Optional — helps interested members find your post.',
}) {
  const uncapped = maxPills == null
  const optionCount = loungePostCategoryPillOptions().length
  const cap = uncapped ? optionCount : Math.max(0, Number(maxPills) || DEFAULT_MAX_PILLS)
  const selected = uncapped
    ? normalizeLoungeProfileCategoryPills(value)
    : normalizeLoungePostCategoryPills(value)
  const atMax = selected.length >= cap

  const toggle = (slug) => {
    if (disabled || typeof onChange !== 'function') return
    const cur = uncapped ? normalizeLoungeProfileCategoryPills(selected) : normalizeLoungePostCategoryPills(selected)
    const idx = cur.indexOf(slug)
    if (idx >= 0) {
      onChange(cur.filter((s) => s !== slug))
      return
    }
    if (atMax) return
    onChange([...cur, slug])
  }

  return (
    <div className="mt-2">
      <p className="mb-1.5 text-[11px] leading-snug text-zinc-500">{hint}</p>
      <div className="lounge-pill-row flex flex-wrap gap-1.5">
        {loungePostCategoryPillOptions().map(({ slug, label }) => {
          const on = selected.includes(slug)
          const chipDisabled = disabled || (!on && atMax)
          return (
            <button
              key={slug}
              type="button"
              disabled={chipDisabled}
              aria-pressed={on}
              onClick={() => toggle(slug)}
              className={`lounge-category-pill inline-flex max-w-full touch-manipulation items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-tight transition-colors [-webkit-tap-highlight-color:transparent] ${
                on
                  ? loungePostCategoryPillChipClass(slug, 'selected')
                  : chipDisabled
                    ? 'cursor-not-allowed border-zinc-700/60 bg-zinc-900/40 text-zinc-600 opacity-60'
                    : loungePostCategoryPillChipClass(slug, 'idle')
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-zinc-600">
        {uncapped ? `${selected.length} selected` : `${selected.length}/${cap} selected`}
      </p>
    </div>
  )
}
