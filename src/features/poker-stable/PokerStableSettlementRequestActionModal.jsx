import { useCallback, useEffect, useMemo, useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { loadSettlementRequest, respondToSettlementRequest } from './pokerStableApi.js'
import {
  pokerStableSettlementKindLabel,
  pokerStableSettlementRequestStatusLabel,
  pokerStableViewerCanRespondToSettlement,
} from './pokerStableActivity.js'

/**
 * Global confirm/deny modal for pending Stable settlement proposals (from Alerts / push).
 */
export default function PokerStableSettlementRequestActionModal({
  supabaseClient,
  userId,
  requestId,
  onClose,
  onResolved,
  onError,
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [request, setRequest] = useState(null)
  const [deal, setDeal] = useState(null)
  const [actorProfile, setActorProfile] = useState(null)

  const loadBundle = useCallback(async () => {
    if (!supabaseClient || !requestId || !userId) return
    setLoading(true)
    onError?.('')
    try {
      const { request: reqRow, error: rErr } = await loadSettlementRequest(supabaseClient, requestId)
      if (rErr) throw rErr
      if (!reqRow) throw new Error('Settlement proposal not found.')

      const [{ data: dealRow }, { data: actor }] = await Promise.all([
        supabaseClient
          .from('poker_stable_deals')
          .select('id, label, deal_type, stakee_user_id, status, baseline_bankroll')
          .eq('id', reqRow.deal_id)
          .maybeSingle(),
        supabaseClient
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
          .eq('user_id', reqRow.proposed_by_user_id)
          .maybeSingle(),
      ])

      setRequest(reqRow)
      setDeal(dealRow || null)
      setActorProfile(actor || null)
    } catch (e) {
      onError?.(e?.message || 'Could not load settlement proposal.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, requestId, userId, onError])

  useEffect(() => {
    void loadBundle()
  }, [loadBundle])

  const canRespond = useMemo(
    () => pokerStableViewerCanRespondToSettlement(request, userId),
    [request, userId],
  )

  const actorLabel = useMemo(() => {
    const name = String(actorProfile?.display_name || '').trim()
    if (name) return name
    const handle = String(actorProfile?.handle || '').trim()
    if (handle) return `@${handle}`
    return 'Counterparty'
  }, [actorProfile])

  const previewSummary = useMemo(() => {
    const preview = request?.preview_json
    if (!preview || typeof preview !== 'object') return null
    return {
      profitAbove: Number(preview.profit_above_baseline) || 0,
      playerCredit: Number(preview.player_credit) || 0,
      baseline: Number(preview.baseline_at_settle) || 0,
    }
  }, [request])

  async function onRespond(response) {
    if (!supabaseClient || !request || !canRespond) return
    setSaving(true)
    onError?.('')
    try {
      const { error, status } = await respondToSettlementRequest(supabaseClient, {
        requestId: request.id,
        response,
      })
      if (error) throw error
      triggerTapHapticLight()
      onResolved?.({ requestId: request.id, response, status })
      onClose?.()
    } catch (e) {
      onError?.(e?.message || 'Could not save your response.')
    } finally {
      setSaving(false)
    }
  }

  if (!requestId) return null

  const settleLabel = pokerStableSettlementKindLabel(request?.settle_kind)

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-sheet
        data-poker-stable-settlement-action-modal
        className={`relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">{settleLabel}</h3>
            <p className="text-xs text-zinc-500">Review and respond</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : !request ? (
          <p className="py-8 text-center text-sm text-rose-300">Proposal unavailable.</p>
        ) : (
          <>
            <div
              data-poker-stable-deal-summary
              className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Proposed by
              </div>
              <p className="mt-1 text-sm text-zinc-300">
                {actorLabel} · {deal?.label || 'Stake'}
              </p>
              {previewSummary ? (
                <div className="mt-3 space-y-1 text-xs text-zinc-400">
                  <p>
                    Profit above baseline:{' '}
                    <span className="font-semibold text-zinc-200">
                      {fmtPoker$(previewSummary.profitAbove)}
                    </span>
                  </p>
                  <p>
                    Player personal credit:{' '}
                    <span className="font-semibold text-zinc-200">
                      {fmtPoker$(previewSummary.playerCredit)}
                    </span>
                  </p>
                  <p>
                    Stake rebalances to:{' '}
                    <span className="font-semibold text-zinc-200">
                      {fmtPoker$(previewSummary.baseline)}
                    </span>
                  </p>
                </div>
              ) : null}
              {request.note ? (
                <p className="mt-2 text-xs text-zinc-400">Note: {request.note}</p>
              ) : null}
              {!canRespond ? (
                <p className="mt-3 text-xs font-semibold text-amber-200/90">
                  Status: {pokerStableSettlementRequestStatusLabel(request)}
                </p>
              ) : null}
            </div>

            {canRespond ? (
              <>
                <p className="mb-3 text-sm leading-relaxed text-zinc-400">
                  Confirm if this settlement matches what you expect. Deny if the numbers or timing
                  are wrong.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onRespond('confirmed')}
                    data-poker-stable-primary-btn
                    className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Confirm settlement'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onRespond('denied')}
                    className="w-full rounded-2xl bg-zinc-800 py-3 text-sm font-semibold text-rose-200 touch-manipulation disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
