/**
 * Normalized stake terms payloads for guest notify (offer / terms_edited).
 */

function normalizeGuestSliceForNotify(slice, sliceIndex, { fromForm = false } = {}) {
  if (fromForm) {
    return {
      slice_id: slice.sliceId || null,
      slice_index: sliceIndex,
      guest_label: String(slice.guestLabel || '').trim(),
      action_pct: Number(slice.actionPct),
      pricing_mode: slice.pricingMode || 'profit_split',
      player_profit_pct:
        slice.pricingMode === 'profit_split' ? Number(slice.playerProfitPct) : null,
      markup_rate: slice.pricingMode === 'markup' ? Number(slice.markupRate) : null,
    }
  }
  return {
    slice_id: slice.id || slice.sliceId || null,
    slice_index: sliceIndex,
    guest_label: String(slice.guest_label || slice.guestLabel || '').trim(),
    action_pct: Number(slice.action_pct ?? slice.actionPct),
    pricing_mode: slice.pricing_mode || slice.pricingMode || 'profit_split',
    player_profit_pct:
      slice.pricing_mode === 'profit_split' || slice.pricingMode === 'profit_split'
        ? Number(slice.player_profit_pct ?? slice.playerProfitPct)
        : null,
    markup_rate:
      slice.pricing_mode === 'markup' || slice.pricingMode === 'markup'
        ? Number(slice.markup_rate ?? slice.markupRate)
        : null,
  }
}

/**
 * @param {object} dealRow
 * @param {object[]} slices form slices (isGuest) or API slice rows
 * @param {{ fromForm?: boolean }} [opts]
 */
export function buildStakeTermsEditNotifyPayload(dealRow, slices, opts = {}) {
  const fromForm = Boolean(opts.fromForm)
  const guestSlices = fromForm
    ? (slices || []).filter((s) => s.isGuest)
    : (slices || []).filter(
        (s) => s.counterparty_kind === 'guest' || s.counterpartyKind === 'guest',
      )

  const label = String(dealRow?.label ?? dealRow?.dealLabel ?? '').trim()
  const baseline = Number(dealRow?.baseline_bankroll ?? dealRow?.baselineBankroll ?? 0)

  return {
    deal_label: label,
    baseline_bankroll: baseline,
    slices: guestSlices.map((s, idx) => normalizeGuestSliceForNotify(s, idx, { fromForm })),
  }
}

/** @param {object | null | undefined} a @param {object | null | undefined} b */
export function stakeTermsEditNotifyPayloadsEqual(a, b) {
  if (!a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
