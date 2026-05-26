import {
  loungePostCategoryPillChipClass,
  loungePostCategoryPillLabel,
} from '../../utils/loungePostCategoryPills.js'

/** Read-only category pill chips for feed rows and post detail. */
export default function LoungePostCategoryPillRow({ pills, className = '' }) {
  const list = Array.isArray(pills) ? pills : []
  if (!list.length) return null
  return (
    <div className={`lounge-pill-row flex flex-wrap gap-1 ${className}`.trim()}>
      {list.map((slug) => (
        <span
          key={slug}
          className={`lounge-category-pill inline-flex max-w-full items-center truncate rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-tight ${loungePostCategoryPillChipClass(slug, 'display')}`}
        >
          {loungePostCategoryPillLabel(slug)}
        </span>
      ))}
    </div>
  )
}
