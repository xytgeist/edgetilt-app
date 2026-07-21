import {
  SUPPORT_BILLING_NO_ACCESS_SUBJECT,
  supportMailtoHref,
} from '../legal/supportContact.js'

/**
 * @param {{
 *   membershipLabel: string,
 *   viewerIsStaff: boolean,
 *   hasPaidMembership: boolean,
 *   hasActiveSubscription: boolean,
 *   onOpenBillingManage?: () => void,
 * }} props
 */
export default function SettingsMembershipPanel({
  membershipLabel,
  viewerIsStaff,
  hasPaidMembership,
  hasActiveSubscription,
  onOpenBillingManage,
}) {
  return (
    <div
      data-settings-memberships
      className="mt-3 rounded-xl border border-zinc-800/90 bg-zinc-950/40 divide-y divide-zinc-800/90"
    >
      <div className="px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-zinc-100">Edge AP Slots</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
              viewerIsStaff
                ? 'bg-fuchsia-500/20 text-fuchsia-200'
                : hasActiveSubscription || hasPaidMembership
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'bg-zinc-700/80 text-zinc-300'
            }`}
          >
            {membershipLabel}
          </span>
        </div>
        {viewerIsStaff ? (
          <p className="mt-2 text-[12px] leading-snug text-zinc-500">
            Team access … full app perks, not a paid membership.
          </p>
        ) : hasPaidMembership ? (
          <button
            type="button"
            onClick={() => onOpenBillingManage?.()}
            className="mt-3 min-h-10 w-full rounded-xl border border-cyan-500/35 bg-cyan-950/25 px-3 text-[13px] font-semibold text-cyan-100 touch-manipulation hover:bg-cyan-950/40 [-webkit-tap-highlight-color:transparent]"
          >
            Manage membership
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onOpenBillingManage?.()}
              className="mt-3 min-h-10 w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 text-[13px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-800/80 [-webkit-tap-highlight-color:transparent]"
            >
              View Edge AP Slots plans
            </button>
            <p className="mt-2 text-[12px] leading-snug text-zinc-500">
              Unlock AP guides, calculators, and subscriber Lounge perks.
            </p>
            <p className="mt-2 text-[12px] leading-snug text-zinc-500">
              Paid but don&apos;t see access?{' '}
              <a
                href={supportMailtoHref({ subject: SUPPORT_BILLING_NO_ACCESS_SUBJECT })}
                className="font-semibold text-orange-400 underline underline-offset-2 hover:text-orange-300 touch-manipulation"
              >
                Contact support
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
