import { useState } from 'react'
import { Pin } from 'lucide-react'
import { QUICK_LINK_BY_ID } from '../features/shell/quickLinkDestinations.js'
import {
  setQuickLinkEnabled,
  useQuickLinkEnabled,
  useQuickLinkIds,
} from '../features/shell/quickLinksStore.js'
import QuickLinkAtCapModal from './QuickLinkAtCapModal.jsx'

/**
 * @param {{
 *   destinationId: import('../features/shell/quickLinkDestinations.js').QuickLinkId,
 *   className?: string,
 *   variant?: 'pill' | 'bare' | 'pin',
 *   pinActiveClassName?: string,
 * }} props
 */
export default function QuickLinkPageToggle({
  destinationId,
  className = '',
  variant = 'pill',
  pinActiveClassName = 'text-cyan-400',
}) {
  const enabled = useQuickLinkEnabled(destinationId)
  const activeIds = useQuickLinkIds()
  const [capOpen, setCapOpen] = useState(false)
  const dest = QUICK_LINK_BY_ID[destinationId]
  if (!dest) return null

  const onToggle = () => {
    if (enabled) {
      setQuickLinkEnabled(destinationId, false)
      return
    }
    const result = setQuickLinkEnabled(destinationId, true)
    if (!result.ok && result.reason === 'at_cap') {
      setCapOpen(true)
    }
  }

  const bare = variant === 'bare'
  const pin = variant === 'pin'

  const switchBtn = (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`Shortcut for ${dest.label}`}
      onClick={onToggle}
      className={
        bare
          ? `relative h-3.5 w-6 shrink-0 rounded-full touch-manipulation transition-colors ${
              enabled ? 'bg-cyan-600' : 'bg-zinc-700'
            }`
          : `relative h-5 w-9 shrink-0 rounded-full touch-manipulation transition-colors ${
              enabled ? 'bg-cyan-600' : 'bg-zinc-700'
            }`
      }
    >
      <span
        className={
          bare
            ? `absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-[left] ${
                enabled ? 'left-[11px]' : 'left-0.5'
              }`
            : `absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
                enabled ? 'left-[18px]' : 'left-0.5'
              }`
        }
      />
    </button>
  )

  const pinBtn = (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? `Unpin ${dest.label} shortcut` : `Pin ${dest.label} shortcut`}
      onClick={onToggle}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg touch-manipulation transition-colors [-webkit-tap-highlight-color:transparent] ${
        enabled
          ? pinActiveClassName
          : 'text-zinc-500 hover:text-zinc-300 active:text-zinc-200'
      }`}
      data-quick-link-pin={enabled ? 'on' : 'off'}
    >
      <Pin
        size={16}
        strokeWidth={2}
        fill={enabled ? 'currentColor' : 'none'}
        aria-hidden
        className={enabled ? 'rotate-0' : 'rotate-45 opacity-80'}
      />
    </button>
  )

  return (
    <>
      {pin ? (
        <div className={className} data-quick-link-toggle="pin">
          {pinBtn}
        </div>
      ) : bare ? (
        <div className={className} data-quick-link-toggle="bare">
          {switchBtn}
        </div>
      ) : (
        <div
          className={`inline-flex max-w-full items-center justify-between gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-2.5 py-1.5 ${className}`}
          data-quick-link-toggle
        >
          <span className="text-zinc-300 text-xs font-semibold whitespace-nowrap">Shortcut</span>
          {switchBtn}
        </div>
      )}
      <QuickLinkAtCapModal
        open={capOpen}
        pendingId={destinationId}
        activeIds={activeIds}
        onClose={() => setCapOpen(false)}
        onEnabled={() => setCapOpen(false)}
      />
    </>
  )
}
