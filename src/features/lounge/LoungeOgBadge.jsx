import LoungeBadgeHoverTip from './LoungeBadgeHoverTip.jsx'

const BADGE_SRC = `${import.meta.env.BASE_URL}og-cohort-badge.svg`

/** @type {Record<'feed' | 'detail' | 'modal', { cls: string, px: number, yClass?: string }>} */
const OG_BADGE_SIZE = {
  feed: { cls: 'h-4 w-4', px: 16, yClass: 'translate-y-[2px]' },
  detail: { cls: 'h-[17px] w-[17px]', px: 17, yClass: 'translate-y-[3px]' },
  /** Profile full-screen header - between feed (+3px) and cap-align. */
  modal: { cls: 'h-5 w-5', px: 20, yClass: 'translate-y-[2px]' },
}

/**
 * Earliest-adopter marker from `profiles.is_og` (first 1k profiles by created_at).
 * Flat gold OG + laurel (`public/og-cohort-badge.svg`); swap for PNG at same path if preferred.
 * Hover tip in `LoungeBadgeHoverTip`.
 *
 * @param {{ isOg?: boolean | null, size?: 'feed' | 'detail' | 'modal' }} props
 */
export default function LoungeOgBadge({ isOg, size = 'feed' }) {
  if (isOg !== true) return null
  const s = OG_BADGE_SIZE[size] ?? OG_BADGE_SIZE.feed
  const iconClass = `${s.cls} shrink-0 object-contain`
  const tipClass = `inline-flex items-center ${s.yClass ?? 'translate-y-[3px]'}`

  return (
    <LoungeBadgeHoverTip tip="OG" tone="amber" className={tipClass}>
      <span className="inline-flex items-center leading-none" role="img" aria-label="OG">
        <img src={BADGE_SRC} alt="" className={`lounge-og-badge ${iconClass}`} draggable={false} width={s.px} height={s.px} aria-hidden />
      </span>
    </LoungeBadgeHoverTip>
  )
}
