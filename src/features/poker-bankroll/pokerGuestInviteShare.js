/**
 * Guest swap/stake invites the creator copies into their own text.
 * We do not send SMS from a leased number (10DLC gambling 704).
 */

import { shareViaBestAvailable } from '../../utils/edgeNative.js'
import { formatTournamentEventLabel } from './pokerTournamentSwapApi.js'

export const GUEST_INVITE_HINT =
  'Paste this into your own text. EdgeTilt does not send SMS for swaps or stakes.'

export function guestInviteActorName(profile) {
  const name = String(profile?.display_name || '').trim()
  if (name) return name
  const handle = String(profile?.handle || '')
    .trim()
    .replace(/^@+/, '')
  if (handle) return `@${handle}`
  return 'Someone'
}

/**
 * Lounge nametag for copy-link invites. Cached swap/stable maps omit the
 * creator on a first guest offer, so fetch `profiles` when the cache is empty.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabase
 * @param {string | null | undefined} userId
 * @param {{ display_name?: string | null, handle?: string | null } | null | undefined} [cachedProfile]
 */
export async function resolveGuestInviteActorName(supabase, userId, cachedProfile) {
  const fromCache = guestInviteActorName(cachedProfile)
  if (fromCache !== 'Someone') return fromCache
  const id = String(userId || '').trim()
  if (!supabase || !id) return fromCache
  try {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, handle')
      .eq('user_id', id)
      .maybeSingle()
    return guestInviteActorName(data)
  } catch {
    return fromCache
  }
}

export function guestInvitePublicOrigin() {
  if (typeof window === 'undefined') return ''
  return String(window.location.origin || '').replace(/\/$/, '')
}

export function buildGuestInviteUrl(path, token) {
  const p = String(path || '').trim()
  const t = String(token || '').trim()
  if (!p || !t) return ''
  const prefix = p.startsWith('/') ? p : `/${p}`
  return `${guestInvitePublicOrigin()}${prefix}?token=${encodeURIComponent(t)}`
}

function parseMintPayload(data) {
  if (!data) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data
}

async function mintGuestInviteRpc(supabase, rpcName, args) {
  const { data, error } = await supabase.rpc(rpcName, args)
  if (error) return { url: '', error }
  const payload = parseMintPayload(data)
  const token = String(payload?.token || '').trim()
  const path = String(payload?.path || '').trim()
  const url = buildGuestInviteUrl(path, token)
  if (!url) return { url: '', error: new Error('Could not create invite link.') }
  return { url, error: null }
}

export async function mintSwapGuestInvite(supabase, swapId) {
  return mintGuestInviteRpc(supabase, 'poker_tournament_swap_mint_invite_link', {
    p_swap_id: swapId,
  })
}

export async function mintStakeeGuestInvite(supabase, dealId) {
  return mintGuestInviteRpc(supabase, 'poker_stable_guest_stakee_mint_invite_link', {
    p_deal_id: dealId,
  })
}

export async function mintBackerGuestInvite(supabase, sliceId) {
  return mintGuestInviteRpc(supabase, 'poker_stable_guest_backer_mint_invite_link', {
    p_slice_id: sliceId,
  })
}

export function formatGuestSwapInviteText({
  actorName,
  pctCreator,
  pctCounterparty,
  eventLabel,
  url,
}) {
  const actor = String(actorName || '').trim() || 'Someone'
  const you = Number.isFinite(Number(pctCreator)) ? Number(pctCreator) : '?'
  const them = Number.isFinite(Number(pctCounterparty)) ? Number(pctCounterparty) : '?'
  const eventBit = String(eventLabel || '').trim() ? ` in event: ${String(eventLabel).trim()}` : ''
  const line = `${actor} is swapping ${you}% - ${them}% with you${eventBit} from EdgeTilt`
  const link = String(url || '').trim()
  return link ? `${line}\n${link}` : line
}

export function formatGuestStakeInviteText({ actorName, kind, dealLabel, url }) {
  const actor = String(actorName || '').trim() || 'Someone'
  const label = String(dealLabel || '').trim()
  const labelBit = label ? ` (${label})` : ''
  const what =
    kind === 'backer'
      ? `${actor} offered you a backing slice on EdgeTilt${labelBit}`
      : `${actor} offered you a stake on EdgeTilt${labelBit}`
  const link = String(url || '').trim()
  return link ? `${what}\n${link}` : what
}

export async function copyGuestInviteText(text) {
  const value = String(text || '').trim()
  if (!value) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // fall through
  }
  try {
    if (typeof document === 'undefined') return false
    const el = document.createElement('textarea')
    el.value = value
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return Boolean(ok)
  } catch {
    return false
  }
}

export async function shareGuestInvite({ title, text, url }) {
  const link = String(url || '').trim()
  const body = String(text || '').trim()
  const textOnly =
    link && body.endsWith(link) ? body.slice(0, body.length - link.length).trim() : body
  return shareViaBestAvailable({
    url: link,
    title: title || 'EdgeTilt invite',
    text: textOnly || body || link,
  })
}

export function isDeletedPartyLabel(label) {
  const value = String(label || '').trim()
  if (!value) return false
  return /^(Deleted User|Deleted account)$/i.test(value)
    || /\(\s*Deleted User\s*\)\s*$/i.test(value)
    || /\(\s*Deleted account\s*\)\s*$/i.test(value)
}

export function swapIsUnclaimedGuest(swap) {
  return (
    swap?.counterparty_kind === 'guest' &&
    !swap?.counterparty_user_id &&
    swap?.status !== 'cancelled' &&
    !isDeletedPartyLabel(swap?.counterparty_guest_label)
  )
}

export function dealIsUnclaimedGuestPlayer(deal) {
  return Boolean(
    deal &&
      !deal.stakee_user_id &&
      String(deal.stakee_guest_label || '').trim() &&
      deal.staker_user_id &&
      !isDeletedPartyLabel(deal.stakee_guest_label),
  )
}

export function sliceIsUnclaimedGuestBacker(slice) {
  return (
    (slice?.counterparty_kind === 'guest' || slice?.counterpartyKind === 'guest') &&
    !slice?.staker_user_id &&
    ['pending', 'proposed', ''].includes(String(slice?.status || 'pending')) &&
    !isDeletedPartyLabel(slice?.guest_label || slice?.guestLabel)
  )
}

export async function mintGuestSwapInviteRows({
  supabase,
  swaps,
  actorName,
  eventsById = {},
}) {
  const rows = []
  for (const swap of swaps || []) {
    if (!swapIsUnclaimedGuest(swap)) continue
    const { url, error } = await mintSwapGuestInvite(supabase, swap.id)
    if (error) {
      console.warn('[poker] guest swap invite mint failed', error.message || error)
      continue
    }
    const event = swap.tournament_event_id ? eventsById[swap.tournament_event_id] : null
    const guestLabel = String(swap.counterparty_guest_label || '').trim() || 'them'
    rows.push({
      id: swap.id,
      title: `Text ${guestLabel}`,
      url,
      text: formatGuestSwapInviteText({
        actorName,
        pctCreator: swap.pct_creator_gives,
        pctCounterparty: swap.pct_counterparty_gives,
        eventLabel: event ? formatTournamentEventLabel(event) : '',
        url,
      }),
      shareTitle: 'Tournament swap',
    })
  }
  return rows
}

export async function loadDealSlicesForInvite(supabase, dealId) {
  if (!supabase || !dealId) return { slices: [], error: null }
  const { data, error } = await supabase
    .from('poker_stable_deal_slices')
    .select('id, deal_id, counterparty_kind, guest_label, guest_email, staker_user_id, status')
    .eq('deal_id', dealId)
  return { slices: data || [], error }
}

export async function mintGuestStakeInviteRows({ supabase, deal, slices, actorName }) {
  const rows = []
  if (dealIsUnclaimedGuestPlayer(deal)) {
    const { url, error } = await mintStakeeGuestInvite(supabase, deal.id)
    if (error) {
      console.warn('[poker] guest player invite mint failed', error.message || error)
    } else if (url) {
      const guestLabel = String(deal.stakee_guest_label || '').trim() || 'them'
      rows.push({
        id: `player:${deal.id}`,
        title: `Text ${guestLabel}`,
        url,
        text: formatGuestStakeInviteText({
          actorName,
          kind: 'player',
          dealLabel: deal.label,
          url,
        }),
        shareTitle: 'Stake invite',
      })
    }
  }
  for (const slice of slices || []) {
    if (!sliceIsUnclaimedGuestBacker(slice)) continue
    const { url, error } = await mintBackerGuestInvite(supabase, slice.id)
    if (error) {
      console.warn('[poker] guest backer invite mint failed', error.message || error)
      continue
    }
    const guestLabel = String(slice.guest_label || slice.guestLabel || '').trim() || 'them'
    rows.push({
      id: slice.id,
      title: `Text ${guestLabel}`,
      url,
      text: formatGuestStakeInviteText({
        actorName,
        kind: 'backer',
        dealLabel: deal?.label,
        url,
      }),
      shareTitle: 'Backing invite',
    })
  }
  return rows
}
