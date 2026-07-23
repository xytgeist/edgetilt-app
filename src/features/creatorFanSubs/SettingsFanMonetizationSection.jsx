import { forwardRef, useCallback, useEffect, useState } from 'react'
import CreatorFanMonetizationPanel from './CreatorFanMonetizationPanel.jsx'
import { fetchMyCreatorFanMonetization } from './creatorFanSubsApi.js'

/**
 * Settings accordion: creator fan monetization (separate from Subscriptions / Creators I support).
 */
const SettingsFanMonetizationSection = forwardRef(function SettingsFanMonetizationSection(
  { supabaseClient, open, onOpenChange, chevron },
  ref,
) {
  const [fanSubsEnabled, setFanSubsEnabled] = useState(false)

  const syncEnabled = useCallback(async () => {
    if (!supabaseClient) {
      setFanSubsEnabled(false)
      return
    }
    try {
      const row = await fetchMyCreatorFanMonetization(supabaseClient)
      setFanSubsEnabled(Boolean(row?.enabled))
    } catch {
      setFanSubsEnabled(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void syncEnabled()
  }, [syncEnabled])

  useEffect(() => {
    if (!open) return
    void syncEnabled()
  }, [open, syncEnabled])

  const sectionTitle = fanSubsEnabled ? 'Fan Subscriptions Enabled' : 'Enable fan subscriptions'

  return (
    <div ref={ref} className="mt-6 border-t border-zinc-800 pt-5" data-settings-fan-monetization-section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex min-h-12 w-full items-start justify-between gap-3 rounded-xl px-1 py-1 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/40"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-zinc-100">{sectionTitle}</span>
          <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
            Preset monthly tiers, fan-only posts, and your Private Subs chat room.
          </span>
        </span>
        {chevron}
      </button>
      {open ? (
        <div className="mt-3 rounded-xl border border-zinc-800/90 bg-zinc-950/40">
          <CreatorFanMonetizationPanel
            supabaseClient={supabaseClient}
            embedded
            onMonetizationRowApplied={(row) => setFanSubsEnabled(Boolean(row?.enabled))}
          />
        </div>
      ) : null}
    </div>
  )
})

export default SettingsFanMonetizationSection
