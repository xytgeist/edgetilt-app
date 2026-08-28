import LoungeBadgeHoverTip from './LoungeBadgeHoverTip.jsx'

/** @type {Record<'feed' | 'detail' | 'modal' | 'embed', { cls: string, textCls: string, yClass?: string }>} */
const BADGE_SIZE = {
  feed: { cls: 'px-1.5 py-0.5 text-[10px]', textCls: 'text-[10px]', yClass: 'inline-flex items-center translate-y-[1px]' },
  detail: { cls: 'px-1.5 py-0.5 text-[11px]', textCls: 'text-[11px]', yClass: 'inline-flex items-center translate-y-[2px]' },
  modal: { cls: 'px-2 py-0.5 text-xs', textCls: 'text-xs', yClass: 'inline-flex items-center' },
  embed: { cls: 'px-1 py-0.2 text-[9px]', textCls: 'text-[9px]', yClass: 'inline-flex items-center' },
}

/**
 * Edge Pro subscriber badge shown on author headers and profiles.
 *
 * @param {{ isEdgePro?: boolean | null, size?: 'feed' | 'detail' | 'modal' | 'embed' }} props
 */
export default function LoungeEdgeProBadge({ isEdgePro, size = 'feed' }) {
  if (isEdgePro !== true) return null
  const s = BADGE_SIZE[size] ?? BADGE_SIZE.feed
  const tipClass = `${s.yClass ?? 'inline-flex items-center'}`

  return (
    <LoungeBadgeHoverTip tip="Edge Pro Subscriber" tone="pro" className={tipClass}>
      <span
        data-edge-pro-badge=""
        className={`inline-flex items-center font-black tracking-wider uppercase rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 text-amber-400 ring-1 ring-amber-500/40 shadow-sm ${s.cls}`}
        role="img"
        aria-label="Edge Pro Subscriber"
      >
        <span className="mr-0.5 text-[10px] leading-none">⚡</span>
        <span>PRO</span>
      </span>
    </LoungeBadgeHoverTip>
  )
}
