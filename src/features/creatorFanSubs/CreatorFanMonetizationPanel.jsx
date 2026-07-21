import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CREATOR_FAN_TIER_KEYS,
  formatFanTierLabel,
} from './fanSubTiers.js'
import {
  fetchMyCreatorFanMonetization,
  refreshCreatorFanConnectStatus,
  saveCreatorFanMonetization,
  saveCreatorFanOffer,
  startCreatorFanConnectOnboarding,
} from './creatorFanSubsApi.js'
import CreatorFanOfferFormFields from './CreatorFanOfferFormFields.jsx'
import { isCreatorFanOfferComplete } from './fanSubOffer.js'

function connectReturnPending() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('settings') === 'fan' && params.get('connect') === 'return'
}

function clearConnectQueryParams() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get('settings') !== 'fan') return
  url.searchParams.delete('settings')
  url.searchParams.delete('connect')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next)
}

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   embedded?: boolean,
 * }} props
 */
export default function CreatorFanMonetizationPanel({ supabaseClient, embedded = false }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [tierKey, setTierKey] = useState('fan-tier-999')
  const [enabled, setEnabled] = useState(false)
  const [connectComplete, setConnectComplete] = useState(false)
  const [handle, setHandle] = useState('')
  const [offerHeadline, setOfferHeadline] = useState('')
  const [offerIntro, setOfferIntro] = useState('')
  const [offerPrivatePosts, setOfferPrivatePosts] = useState('')
  const [offerFanChat, setOfferFanChat] = useState('')
  const [offerComplete, setOfferComplete] = useState(false)

  const applyRow = useCallback((row) => {
    if (!row) return
    if (row.fan_tier_key) setTierKey(String(row.fan_tier_key))
    setEnabled(Boolean(row.enabled))
    setConnectComplete(Boolean(row.connect_onboarding_complete))
    setHandle(typeof row.handle === 'string' ? row.handle : '')
    setOfferHeadline(typeof row.offer_headline === 'string' ? row.offer_headline : '')
    setOfferIntro(typeof row.offer_intro === 'string' ? row.offer_intro : '')
    setOfferPrivatePosts(typeof row.offer_private_posts === 'string' ? row.offer_private_posts : '')
    setOfferFanChat(typeof row.offer_fan_chat === 'string' ? row.offer_fan_chat : '')
    setOfferComplete(isCreatorFanOfferComplete(row))
  }, [])

  const reload = useCallback(async () => {
    if (!supabaseClient) {
      setLoading(false)
      return
    }
    setError('')
    try {
      const row = await fetchMyCreatorFanMonetization(supabaseClient)
      applyRow(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load fan subscription settings.')
    } finally {
      setLoading(false)
    }
  }, [applyRow, supabaseClient])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!supabaseClient || !connectReturnPending()) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        await refreshCreatorFanConnectStatus(supabaseClient)
        if (!cancelled) {
          setStatusMessage('Stripe Connect updated. Finish your offer, then go live.')
          clearConnectQueryParams()
          await reload()
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Connect refresh failed.')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient, reload])

  const draftOfferComplete = useMemo(
    () =>
      isCreatorFanOfferComplete({
        offer_intro: offerIntro,
        offer_private_posts: offerPrivatePosts,
        offer_fan_chat: offerFanChat,
      }),
    [offerFanChat, offerIntro, offerPrivatePosts],
  )

  const onConnect = async () => {
    if (!supabaseClient || busy) return
    setBusy(true)
    setError('')
    setStatusMessage('')
    try {
      await startCreatorFanConnectOnboarding(supabaseClient)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed.')
      setBusy(false)
    }
  }

  const onSaveOffer = async () => {
    if (!supabaseClient || busy) return
    setBusy(true)
    setError('')
    setStatusMessage('')
    try {
      const row = await saveCreatorFanOffer(supabaseClient, {
        offerHeadline,
        offerIntro,
        offerPrivatePosts,
        offerFanChat,
      })
      applyRow(row)
      setStatusMessage('Offer saved. Fans will see this before they subscribe.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save offer.')
    } finally {
      setBusy(false)
    }
  }

  const onSave = async (nextEnabled) => {
    if (!supabaseClient || busy) return
    if (nextEnabled && !draftOfferComplete && !offerComplete) {
      setError('Save your offer first (overview + at least one detail section).')
      return
    }
    setBusy(true)
    setError('')
    setStatusMessage('')
    try {
      if (nextEnabled && draftOfferComplete) {
        await saveCreatorFanOffer(supabaseClient, {
          offerHeadline,
          offerIntro,
          offerPrivatePosts,
          offerFanChat,
        })
      }
      const row = await saveCreatorFanMonetization(supabaseClient, tierKey, nextEnabled)
      applyRow(row)
      setEnabled(nextEnabled)
      setStatusMessage(nextEnabled ? 'Fan subscriptions are live.' : 'Fan subscriptions paused.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const missingHandle = !handle?.trim()
  const canGoLive = connectComplete && (offerComplete || draftOfferComplete)
  const showOfferGap = enabled && !offerComplete

  const body = loading ? (
    <p className="text-[13px] text-zinc-500">Loading…</p>
  ) : missingHandle ? (
    <p className="text-[13px] leading-relaxed text-amber-200/90">
      Set a profile handle first, then you can connect payouts and choose a tier.
    </p>
  ) : (
    <div className="space-y-4">
          {showOfferGap ? (
            <p className="rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-2 text-[13px] leading-relaxed text-amber-100/95">
              Your offer is incomplete … fans cannot subscribe until you save the form below.
            </p>
          ) : null}

          <label className="block">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
              Monthly tier
            </span>
            <select
              value={tierKey}
              disabled={busy || enabled}
              onChange={(e) => setTierKey(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-3 py-2.5 text-[14px] text-zinc-100"
            >
              {CREATOR_FAN_TIER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {formatFanTierLabel(key)}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-3">
            <span className="block text-[14px] font-semibold text-zinc-200">What fans get</span>
            <div className="mt-3">
              <CreatorFanOfferFormFields
                headline={offerHeadline}
                intro={offerIntro}
                privatePosts={offerPrivatePosts}
                fanChat={offerFanChat}
                disabled={busy}
                onHeadlineChange={setOfferHeadline}
                onIntroChange={setOfferIntro}
                onPrivatePostsChange={setOfferPrivatePosts}
                onFanChatChange={setOfferFanChat}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSaveOffer()}
              className="mt-2 min-h-10 rounded-lg border border-zinc-600/90 bg-zinc-800/80 px-4 text-[13px] font-semibold text-zinc-100 hover:bg-zinc-700/80 disabled:opacity-50"
            >
              Save offer
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onConnect()}
              className="min-h-10 rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-3 text-[13px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {connectComplete ? 'Update Stripe Connect' : 'Connect payouts (Stripe)'}
            </button>
            {connectComplete ? (
              <span className="text-[12px] font-semibold text-emerald-300/90">Payouts ready</span>
            ) : (
              <span className="text-[12px] text-zinc-500">Required before going live</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !canGoLive || enabled}
              onClick={() => void onSave(true)}
              className="min-h-10 rounded-lg bg-orange-500/90 px-4 text-[13px] font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
            >
              Turn on fan subscriptions
            </button>
            {enabled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSave(false)}
                className="min-h-10 rounded-lg border border-zinc-700/90 px-4 text-[13px] font-semibold text-zinc-300 hover:bg-zinc-800/80 disabled:opacity-50"
              >
                Pause
              </button>
            ) : null}
          </div>
    </div>
  )

  const footer = (
    <>
      {statusMessage ? (
        <p className="mt-2 text-[12px] leading-snug text-cyan-200/90">{statusMessage}</p>
      ) : null}
      {error ? <p className="mt-2 text-[12px] leading-snug text-red-300/95">{error}</p> : null}
    </>
  )

  if (embedded) {
    return (
      <div className="px-3.5 py-3" data-settings-fan-monetization>
        {body}
        {footer}
      </div>
    )
  }

  return (
    <div className="mt-6 border-t border-zinc-800 pt-5" data-settings-fan-monetization>
      <span className="block text-[15px] font-semibold text-zinc-100">Fan subscriptions</span>
      <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
        Preset monthly tiers, 70% to you / 30% platform. Fan-only posts and a private fan group chat.
      </span>
      <div className="mt-3">{body}</div>
      {footer}
    </div>
  )
}
