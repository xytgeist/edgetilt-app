import { guestNotifyContactFieldErrors } from '../../utils/guestNotifyContact.js'
import { roundMoney, sumSliceActionPct } from '../poker-stable/pokerStableMath.js'

export function emptyDraftBacker({ isGuest = false } = {}) {
  return {
    key: `backer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isGuest,
    stakerUserId: '',
    handle: '',
    displayName: '',
    guestLabel: '',
    guestEmail: '',
    actionPct: '',
    playerProfitPct: '50',
  }
}

export function draftBackerUsedUserIds(drafts) {
  return (drafts || [])
    .map((d) => String(d.stakerUserId || '').trim())
    .filter(Boolean)
}

/** @param {object[]} drafts */
export function parseDraftBackersForCreate(drafts, userId) {
  const slices = []
  for (const draft of drafts || []) {
    const actionPct = Number(draft.actionPct)
    if (!Number.isFinite(actionPct) || actionPct <= 0 || actionPct > 100) {
      return { slices: [], error: new Error('Each backer needs action % between 1 and 100.') }
    }
    const playerProfitPct = Number(draft.playerProfitPct)
    if (!Number.isFinite(playerProfitPct) || playerProfitPct <= 0 || playerProfitPct > 100) {
      return { slices: [], error: new Error('Each backer needs player profit % between 1 and 100.') }
    }
    if (draft.isGuest) {
      const name = String(draft.guestLabel || '').trim()
      if (!name) return { slices: [], error: new Error('Guest backers need a name.') }
      const contactErr = guestNotifyContactFieldErrors({
        email: draft.guestEmail,
        phone: '',
      })
      if (contactErr.email) return { slices: [], error: new Error(contactErr.email) }
      slices.push({
        counterpartyKind: 'guest',
        guestLabel: name,
        guestEmail: String(draft.guestEmail || '').trim().toLowerCase() || null,
        guestPhone: null,
        actionPct,
        pricingMode: 'profit_split',
        playerProfitPct,
      })
      continue
    }
    const stakerUserId = String(draft.stakerUserId || '').trim()
    if (!stakerUserId) return { slices: [], error: new Error('Pick an Edge backer.') }
    if (stakerUserId === userId) {
      return { slices: [], error: new Error('You cannot add yourself as a backer.') }
    }
    slices.push({
      counterpartyKind: 'user',
      stakerUserId,
      actionPct,
      pricingMode: 'profit_split',
      playerProfitPct,
    })
  }
  if (!slices.length) return { slices: [], error: new Error('Add at least one backer.') }
  if (sumSliceActionPct(slices) > 100.001) {
    return { slices: [], error: new Error('Total action sold cannot exceed 100%.') }
  }
  return { slices, error: null }
}

export function draftBackerActionSold(drafts) {
  return roundMoney(
    (drafts || []).reduce((sum, d) => {
      const n = Number(d.actionPct)
      return sum + (Number.isFinite(n) && n > 0 ? n : 0)
    }, 0),
    3,
  )
}
