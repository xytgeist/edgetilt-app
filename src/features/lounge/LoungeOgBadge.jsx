import { useSyncExternalStore } from 'react'
import LoungeBadgeHoverTip from './LoungeBadgeHoverTip.jsx'

const BASE = import.meta.env.BASE_URL
const OG_BADGE_SRC_LIGHT = `${BASE}og-cohort-badge-light.svg`
const OG_BADGE_SRC_DARK = `${BASE}og-cohort-badge-dark.svg`

function readIsLightTheme() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light')
}

function subscribeLightTheme(onStoreChange) {
  if (typeof document === 'undefined') return () => {}
  const obs = new MutationObserver(onStoreChange)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => obs.disconnect()
}

/** @type {Record<'feed' | 'detail' | 'modal' | 'embed', { cls: string, px: number, yClass?: string }>} */
const OG_BADGE_SIZE = {
  feed: { cls: 'h-4 w-4', px: 16, yClass: 'translate-y-[2px]' },
  detail: { cls: 'h-[17px] w-[17px]', px: 17, yClass: 'translate-y-[3px]' },
  /** Profile full-screen header - between feed (+3px) and cap-align. */
  modal: { cls: 'h-5 w-5', px: 20, yClass: 'translate-y-[2px]' },
  embed: { cls: 'h-[14px] w-[14px]', px: 14, yClass: 'inline-flex items-center' },
}

/**
 * Earliest-adopter marker from `profiles.is_og` (first 1k profiles by created_at).
 * Light mode: gold wreath + black OG (`og-cohort-badge-light.svg`).
 * Dark mode: all gold (`og-cohort-badge-dark.svg`).
 * Hover tip in `LoungeBadgeHoverTip`.
 *
 * @param {{ isOg?: boolean | null, size?: 'feed' | 'detail' | 'modal' | 'embed' }} props
 */
export default function LoungeOgBadge({ isOg, size = 'feed' }) {
  const isLight = useSyncExternalStore(subscribeLightTheme, readIsLightTheme, () => false)

  if (isOg !== true) return null
  const s = OG_BADGE_SIZE[size] ?? OG_BADGE_SIZE.feed
  const iconClass = `${s.cls} shrink-0 object-contain`
  const tipClass = `inline-flex items-center ${s.yClass ?? 'translate-y-[3px]'}`
  const badgeSrc = isLight ? OG_BADGE_SRC_LIGHT : OG_BADGE_SRC_DARK

  return (
    <LoungeBadgeHoverTip tip="OG" tone="og" className={tipClass}>
      <span className="inline-flex items-center leading-none" role="img" aria-label="OG">
        <img
          src={badgeSrc}
          alt=""
          className={`lounge-og-badge ${iconClass}`}
          draggable={false}
          width={s.px}
          height={s.px}
          aria-hidden
        />
      </span>
    </LoungeBadgeHoverTip>
  )
}
