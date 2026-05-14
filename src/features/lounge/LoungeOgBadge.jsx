import LoungeBadgeHoverTip from './LoungeBadgeHoverTip.jsx'

const BADGE_SRC = `${import.meta.env.BASE_URL}og-cohort-badge.svg`

/** @type {Record<'feed' | 'detail' | 'modal', { cls: string, px: number }>} */
const OG_BADGE_SIZE = {
  feed: { cls: 'h-[15px] w-[15px]', px: 15 },
  detail: { cls: 'h-4 w-4', px: 16 },
  modal: { cls: 'h-[18px] w-[18px]', px: 18 },
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

  return (
    <LoungeBadgeHoverTip
      tip="One of the first 1,000 members"
      tone="amber"
      className="translate-y-[0.5px] -mx-0.5"
    >
      <span className="inline-flex leading-none" role="img" aria-label="OG cohort: one of the first 1,000 members">
        <img src={BADGE_SRC} alt="" className={iconClass} draggable={false} width={s.px} height={s.px} aria-hidden />
      </span>
    </LoungeBadgeHoverTip>
  )
}
