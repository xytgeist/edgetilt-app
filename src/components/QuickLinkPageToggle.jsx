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
        className={`inline-flex max-w-full items-center justify-between gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-2.5 py-1.5 ${className}`}
        data-quick-link-toggle
      >
        <span className="text-zinc-300 text-xs font-semibold whitespace-nowrap">Quick link</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Quick link for ${dest.label}`}
          onClick={onToggle}
          className={`relative h-5 w-9 shrink-0 rounded-full touch-manipulation transition-colors ${
            enabled ? 'bg-cyan-600' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
              enabled ? 'left-[18px]' : 'left-0.5'
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
