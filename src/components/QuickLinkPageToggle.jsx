import { useState } from 'react'
import { QUICK_LINK_BY_ID } from '../features/shell/quickLinkDestinations.js'
import {
  setQuickLinkEnabled,
  useQuickLinkEnabled,
  useQuickLinkIds,
} from '../features/shell/quickLinksStore.js'
import QuickLinkAtCapModal from './QuickLinkAtCapModal.jsx'

/**
 * @param {{ destinationId: import('../features/shell/quickLinkDestinations.js').QuickLinkId, className?: string }} props
 */
export default function QuickLinkPageToggle({ destinationId, className = '' }) {
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

  return (
    <>
      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-3 py-2 mb-3 ${className}`}
        data-quick-link-toggle
      >
        <div className="min-w-0">
          <div className="text-zinc-300 text-xs font-semibold">Quick link</div>
          <div className="text-zinc-500 text-[11px] leading-snug mt-0.5">
            Pin {dest.label} to the title bar
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Quick link for ${dest.label}`}
          onClick={onToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full touch-manipulation transition-colors ${
            enabled ? 'bg-cyan-600' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${
              enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
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
