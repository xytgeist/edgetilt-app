import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import InField, { INFIELD_CONTROL } from '../../components/InField.jsx'
import MoneyInputField from '../../components/MoneyInputField.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { formatMoneyInputValue, parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import StablePlayerPicker from './StablePlayerPicker.jsx'
import { createBackingDeal, lookupProfileByHandle, requestBackingDeal, applyStakeeDealTerms, proposePendingDealTerms, reassignGuestSliceToUser, notifyStableStakeGuests, notifyStableGuestStakee, notifyStableGuestSyndicateBackers, stakeeProposeCounterTerms } from './pokerStableApi.js'
import { buildStakeTermsEditNotifyPayload, stakeTermsEditNotifyPayloadsEqual } from './pokerStableNotifyTerms.js'
import {
  backerSliceAllocatedCapital,
  computeBackerAvailableBankroll,
  computeBackerPendingHold,
} from './pokerStableBackerMath.js'
import { buildTermsPayload, sliceRowToFormSlice } from './pokerStableTerms.js'
import {
  POKER_STABLE_TYPEAHEAD_RESERVE_PX,
  scrollPokerStableSliceIntoView,
  usePokerStableSheetKeyboardDismissScroll,
} from './pokerStableSheetScroll.js'
import { roundMoney } from './pokerStableMath.js'
import {
  guestNotifyContactFieldErrors,
  guestNotifyContactFieldsValid,
  parseGuestNotifyContact,
} from '../../utils/guestNotifyContact.js'
import {
  pokerStableSliceCardClass,
  pokerStableSliceTitleClass,
  pokerStableBackerSliceLabel,
  pokerStableSliceToneAttr,
} from './pokerStableSliceTone.js'

const STABLE_INFIELD_FOCUS = 'focus-within:ring-2 focus-within:ring-amber-500/40'

const EMPTY_SLICE = {
  handle: '',
  selectedProfile: null,
  guestLabel: '',
  guestPhone: '',
  guestEmail: '',
  isGuest: false,
  actionPct: '',
  pricingMode: 'profit_split',
  playerProfitPct: '',
  markupRate: '',
  rakebackMode: 'disabled',
  rakebackPlayerPct: '',
}

function defaultPricingModeForDealType(dealType) {
  return dealType === 'tournament_package' ? 'markup' : 'profit_split'
}

function newEmptySlice(dealType = 'cash_backing') {
  const pricingMode = defaultPricingModeForDealType(dealType)
  return { ...EMPTY_SLICE, pricingMode }
}

function applyDealTypePricingDefaults(slice, dealType) {
  const pricingMode = defaultPricingModeForDealType(dealType)
  if (slice.pricingMode === pricingMode) return slice
  return {
    ...slice,
    pricingMode,
    playerProfitPct: pricingMode === 'profit_split' ? '' : '',
    markupRate: pricingMode === 'markup' ? '' : '',
  }
}

async function resolveUserSlice(supabaseClient, sl, userId, { allowSelf = false } = {}) {
  const actionPct = Number(sl.actionPct)
  if (!Number.isFinite(actionPct) || actionPct <= 0 || actionPct > 100) {
    throw new Error('Each slice needs action % between 1 and 100.')
  }
  if (sl.pricingMode === 'profit_split') {
    const playerProfitPct = Number(sl.playerProfitPct)
    if (!Number.isFinite(playerProfitPct) || playerProfitPct <= 0 || playerProfitPct > 100) {
      throw new Error('Each profit-split slice needs player profit % between 1 and 100.')
    }
  } else {
    const markupRate = Number(sl.markupRate)
    if (!Number.isFinite(markupRate) || markupRate <= 0) {
      throw new Error('Each markup slice needs a markup rate.')
    }
  }
  if (sl.rakebackMode === 'custom') {
    const rakebackPlayerPct = Number(sl.rakebackPlayerPct)
    if (!Number.isFinite(rakebackPlayerPct) || rakebackPlayerPct < 0 || rakebackPlayerPct > 100) {
      throw new Error('Custom rakeback slices need player rakeback % between 0 and 100.')
    }
  }
  if (sl.isGuest) {
    if (!sl.guestLabel.trim()) throw new Error('Guest slices need a name.')
    const { email: guestEmail, phone: guestPhone } = parseGuestNotifyContact({
      email: sl.guestEmail,
      phone: sl.guestPhone,
      label: 'Guest backer',
    })
    return {
      ...(sl.sliceId ? { sliceId: sl.sliceId } : {}),
      counterpartyKind: 'guest',
      guestLabel: sl.guestLabel.trim(),
      guestPhone,
      guestEmail,
      actionPct,
      pricingMode: sl.pricingMode,
      playerProfitPct: sl.pricingMode === 'profit_split' ? Number(sl.playerProfitPct) : undefined,
      markupRate: sl.pricingMode === 'markup' ? Number(sl.markupRate) : undefined,
      rakebackMode: sl.rakebackMode,
      rakebackPlayerPct: sl.rakebackMode === 'custom' ? Number(sl.rakebackPlayerPct) : undefined,
    }
  }
  const { profile, error: lookErr } = sl.selectedProfile
    ? { profile: sl.selectedProfile, error: null }
    : sl.stakerUserId
      ? { profile: { user_id: sl.stakerUserId }, error: null }
      : await lookupProfileByHandle(supabaseClient, sl.handle, { excludeUserId: userId })
  if (lookErr) throw lookErr
  if (!profile?.user_id) throw new Error(`No Edge user for @${sl.handle}.`)
  if (!allowSelf && profile.user_id === userId) throw new Error('You cannot add yourself as a backer.')
  return {
    ...(sl.sliceId ? { sliceId: sl.sliceId } : {}),
    counterpartyKind: 'user',
    stakerUserId: profile.user_id,
    actionPct,
    pricingMode: sl.pricingMode,
    playerProfitPct: sl.pricingMode === 'profit_split' ? Number(sl.playerProfitPct) : undefined,
    markupRate: sl.pricingMode === 'markup' ? Number(sl.markupRate) : undefined,
    rakebackMode: sl.rakebackMode,
    rakebackPlayerPct: sl.rakebackMode === 'custom' ? Number(sl.rakebackPlayerPct) : undefined,
  }
}

function SliceEditor({
  sl,
  idx,
  sliceIndex,
  userId,
  supabaseClient,
  onChange,
  onRemove,
  canRemove,
  title,
  lockUserId = null,
  showRakeback = false,
}) {
  const guestContactErrors = sl.isGuest
    ? guestNotifyContactFieldErrors({ email: sl.guestEmail, phone: sl.guestPhone })
    : { email: '', phone: '' }

  return (
    <div
      data-poker-stable-slice={sliceIndex}
      data-poker-stable-slice-tone={pokerStableSliceToneAttr(sliceIndex)}
      className={pokerStableSliceCardClass(sliceIndex)}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={pokerStableSliceTitleClass(sliceIndex)}>
          {title || pokerStableBackerSliceLabel(1, idx)}
        </span>
        {canRemove ? (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-rose-400">
            Remove
          </button>
        ) : null}
      </div>
      {!lockUserId ? (
        <>
          <InField label="Backer" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
            <StablePlayerPicker
              supabaseClient={supabaseClient}
              userId={userId}
              value={sl.isGuest ? '' : sl.handle}
              onChange={(next) => {
                if (sl.isGuest) {
                  if (!String(next || '').trim()) return
                  onChange({
                    handle: next,
                    selectedProfile: null,
                    isGuest: false,
                    guestLabel: '',
                    guestPhone: '',
                    guestEmail: '',
                  })
                } else {
                  onChange({ handle: next, selectedProfile: null })
                }
              }}
              selectedProfile={sl.selectedProfile}
              isGuest={sl.isGuest}
              guestLabel={sl.guestLabel}
              onSelectProfile={(profile) => {
                if (!profile) return
                if (profile.user_id === userId) return
                onChange({
                  isGuest: false,
                  handle: String(profile.handle || '').replace(/^@+/, ''),
                  selectedProfile: profile,
                  guestLabel: '',
                  guestPhone: '',
                  guestEmail: '',
                })
              }}
              onSelectGuestMode={(draftLabel) => {
                onChange({
                  isGuest: true,
                  handle: '',
                  selectedProfile: null,
                  guestLabel: draftLabel || '',
                  guestPhone: '',
                  guestEmail: '',
                })
              }}
              onClearSelection={() => {
                onChange({
                  isGuest: false,
                  handle: '',
                  selectedProfile: null,
                  guestLabel: '',
                  guestPhone: '',
                  guestEmail: '',
                })
              }}
              guestRowTitle="Guest backer (not on Edge)"
              lockedGuestFallback="Guest backer (not on Edge)"
              inputName={`stable-backer-picker-${sliceIndex}`}
              inputClassName={INFIELD_CONTROL}
              placeholder="Select backer"
            />
          </InField>
          {sl.isGuest ? (
            <>
              <InField label="Guest name" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                <input
                  value={sl.guestLabel}
                  onChange={(e) => onChange({ guestLabel: e.target.value })}
                  placeholder="Name"
                  className={INFIELD_CONTROL}
                />
              </InField>
              <InField label="Phone (optional SMS)" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                <input
                  value={sl.guestPhone}
                  onChange={(e) => onChange({ guestPhone: e.target.value })}
                  placeholder="Phone (optional SMS)"
                  inputMode="tel"
                  autoComplete="tel"
                  className={INFIELD_CONTROL}
                  aria-invalid={guestContactErrors.phone ? 'true' : undefined}
                />
              </InField>
              {guestContactErrors.phone ? (
                <p className="mb-2 text-[11px] text-rose-400">{guestContactErrors.phone}</p>
              ) : null}
              <InField label="Email (optional)" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                <input
                  value={sl.guestEmail}
                  onChange={(e) => onChange({ guestEmail: e.target.value })}
                  placeholder="Email (optional)"
                  inputMode="email"
                  autoComplete="email"
                  className={INFIELD_CONTROL}
                  aria-invalid={guestContactErrors.email ? 'true' : undefined}
                />
              </InField>
              {guestContactErrors.email ? (
                <p className="mb-2 text-[11px] text-rose-400">{guestContactErrors.email}</p>
              ) : null}
              <p className="mb-2 text-[11px] leading-snug text-zinc-500">
                Phone/email optional ... only used to notify them about this stake.
              </p>
            </>
          ) : null}
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <InField label="Action %" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={sl.actionPct}
            onChange={(e) => onChange({ actionPct: e.target.value })}
            placeholder="50"
            inputMode="decimal"
            className={INFIELD_CONTROL}
          />
        </InField>
        <InField label="Pricing" focusRingClass={STABLE_INFIELD_FOCUS}>
          <select
            value={sl.pricingMode}
            onChange={(e) => onChange({ pricingMode: e.target.value })}
            className={`${INFIELD_CONTROL} appearance-none`}
          >
            <option value="profit_split">Profit split</option>
            <option value="markup">Markup</option>
          </select>
        </InField>
      </div>
      {sl.pricingMode === 'profit_split' ? (
        <InField label="Player profit %" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={sl.playerProfitPct}
            onChange={(e) => onChange({ playerProfitPct: e.target.value })}
            placeholder="70"
            inputMode="decimal"
            className={INFIELD_CONTROL}
          />
        </InField>
      ) : (
        <InField label="Markup rate" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={sl.markupRate}
            onChange={(e) => onChange({ markupRate: e.target.value })}
            placeholder="1.2"
            inputMode="decimal"
            className={INFIELD_CONTROL}
          />
        </InField>
      )}
      {showRakeback ? (
        <>
          <InField label="Rakeback" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
            <select
              value={sl.rakebackMode}
              onChange={(e) => onChange({ rakebackMode: e.target.value })}
              className={`${INFIELD_CONTROL} appearance-none`}
            >
              <option value="all_to_stake">100% to stake</option>
              <option value="custom">Custom split</option>
              <option value="disabled">Disabled</option>
            </select>
          </InField>
          {sl.rakebackMode === 'custom' ? (
            <InField label="Player rakeback %" className="mt-2" focusRingClass={STABLE_INFIELD_FOCUS}>
              <input
                value={sl.rakebackPlayerPct}
                onChange={(e) => onChange({ rakebackPlayerPct: e.target.value })}
                placeholder="50"
                inputMode="decimal"
                className={INFIELD_CONTROL}
              />
            </InField>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function PokerStablePlayerDealSheet(props) {
  return <PokerStableDealFormSheet mode="player" {...props} />
}

export function PokerStableBackerDealSheet(props) {
  return <PokerStableDealFormSheet mode="backer" {...props} />
}

export default function PokerStableCreateDealSheet(props) {
  return <PokerStableDealFormSheet mode="player" {...props} />
}

function PokerStableDealFormSheet({
  mode = 'player',
  supabaseClient,
  userId,
  saving,
  onSavingChange,
  onClose,
  onCreated,
  onUpdated,
  onError,
  editDeal = null,
  editSlices = null,
  editProfilesById = {},
  termsIntent = 'create',
  backingBankrollBalance = null,
  stableDeals = [],
  stableSlicesByDeal = {},
}) {
  const isBacker = mode === 'backer'
  const isEdit = Boolean(editDeal?.id)
  const isBackerPropose = termsIntent === 'backer_propose'
  const isStakeeCounter = termsIntent === 'stakee_counter'
  const showHorsePicker = isBacker && !isEdit && !isBackerPropose
  const showPlayerTermsForm = !isBacker || isBackerPropose || isStakeeCounter
  const [label, setLabel] = useState('')
  const [dealType, setDealType] = useState('cash_backing')
  const [venueKind, setVenueKind] = useState('live')
  const [baseline, setBaseline] = useState('')
  const [isMigration, setIsMigration] = useState(false)
  const [startingRoll, setStartingRoll] = useState('')
  const [stakeWidePl, setStakeWidePl] = useState('')
  const [lifetimePl, setLifetimePl] = useState('')
  const [playerHandle, setPlayerHandle] = useState('')
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState(null)
  const [playerIsGuest, setPlayerIsGuest] = useState(false)
  const [playerGuestLabel, setPlayerGuestLabel] = useState('')
  const [playerGuestPhone, setPlayerGuestPhone] = useState('')
  const [playerGuestEmail, setPlayerGuestEmail] = useState('')
  const [mySlice, setMySlice] = useState({ ...EMPTY_SLICE, stakerUserId: userId })
  const [friendSlices, setFriendSlices] = useState([])
  const [slices, setSlices] = useState([{ ...EMPTY_SLICE }])
  const [formError, setFormError] = useState('')
  const sheetRef = useRef(null)
  const actionsRef = useRef(null)
  const scrollSliceIdxRef = useRef(/** @type {number | null} */ (null))
  usePokerStableSheetKeyboardDismissScroll(sheetRef, actionsRef)

  function clearPlayerSelection() {
    setPlayerIsGuest(false)
    setSelectedPlayerProfile(null)
    setPlayerHandle('')
    setPlayerGuestLabel('')
    setPlayerGuestPhone('')
    setPlayerGuestEmail('')
  }

  function onDealTypeChange(next) {
    setDealType(next)
    const apply = (prev) => prev.map((s) => applyDealTypePricingDefaults(s, next))
    setSlices(apply)
    if (isBacker) {
      setMySlice((prev) => applyDealTypePricingDefaults(prev, next))
      setFriendSlices(apply)
    }
  }

  function onVenueKindChange(next) {
    setVenueKind(next)
    if (next !== 'online') {
      const clearRakeback = (s) => ({ ...s, rakebackMode: 'disabled', rakebackPlayerPct: '' })
      setSlices((prev) => prev.map(clearRakeback))
      if (isBacker) {
        setMySlice(clearRakeback)
        setFriendSlices((prev) => prev.map(clearRakeback))
      }
    }
  }

  useEffect(() => {
    if (!editDeal) return
    setDealType(editDeal.deal_type || 'cash_backing')
    setVenueKind(editDeal.venue_kind || 'live')
    setLabel(editDeal.label || '')
    setBaseline(
      editDeal.baseline_bankroll != null
        ? formatMoneyInputValue(String(editDeal.baseline_bankroll))
        : '',
    )
    setIsMigration(Boolean(editDeal.is_migration))
    setStartingRoll(
      editDeal.starting_roll != null
        ? formatMoneyInputValue(String(editDeal.starting_roll))
        : '',
    )
    setStakeWidePl(
      editDeal.stake_wide_starting_pl != null
        ? formatMoneyInputValue(String(editDeal.stake_wide_starting_pl), { allowNegative: true })
        : '',
    )
    setLifetimePl(
      editDeal.lifetime_pl_display != null
        ? formatMoneyInputValue(String(editDeal.lifetime_pl_display), { allowNegative: true })
        : '',
    )
    const rows =
      editDeal.status === 'revoked'
        ? []
        : (editSlices || []).filter((sl) => sl.status !== 'declined')
    setSlices(
      rows.length
        ? rows.map((sl) => sliceRowToFormSlice(sl, editProfilesById))
        : [newEmptySlice(editDeal.deal_type || 'cash_backing')],
    )
    setFormError('')
  }, [editDeal, editSlices, editProfilesById])

  function addBackerSlice() {
    scrollSliceIdxRef.current = isBacker ? friendSlices.length + 1 : slices.length
    if (isBacker) setFriendSlices((prev) => [...prev, newEmptySlice(dealType)])
    else setSlices((prev) => [...prev, newEmptySlice(dealType)])
  }

  useLayoutEffect(() => {
    const targetIdx = scrollSliceIdxRef.current
    if (targetIdx == null) return undefined
    scrollSliceIdxRef.current = null

    const run = () => {
      const sliceEl = sheetRef.current?.querySelector(`[data-poker-stable-slice="${targetIdx}"]`)
      if (sliceEl instanceof HTMLElement) {
        scrollPokerStableSliceIntoView(sliceEl, {
          reserveBelowPx: POKER_STABLE_TYPEAHEAD_RESERVE_PX,
        })
      }
    }

    run()
    const raf = requestAnimationFrame(run)
    const timer = window.setTimeout(run, 120)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [slices.length, friendSlices.length])

  const backerPendingHold = useMemo(
    () =>
      isBacker && userId
        ? computeBackerPendingHold({ deals: stableDeals, slicesByDeal: stableSlicesByDeal, userId })
        : 0,
    [isBacker, userId, stableDeals, stableSlicesByDeal],
  )

  const backerAvailableBankrollDisplay = useMemo(() => {
    const pool = computeBackerAvailableBankroll(
      Number(backingBankrollBalance) || 0,
      backerPendingHold,
    )
    if (showPlayerTermsForm) return pool
    const baselineAmount = parseMoneyInputNumber(baseline)
    const actionPct = Number(mySlice.actionPct)
    if (
      !baseline.trim() ||
      !Number.isFinite(baselineAmount) ||
      baselineAmount <= 0 ||
      !Number.isFinite(actionPct) ||
      actionPct <= 0 ||
      actionPct > 100
    ) {
      return pool
    }
    const committed = backerSliceAllocatedCapital(
      { baseline_bankroll: baselineAmount },
      { action_pct: actionPct },
    )
    return roundMoney(pool - committed)
  }, [showPlayerTermsForm, backingBankrollBalance, backerPendingHold, baseline, mySlice.actionPct])

  function updateSlice(idx, patch) {
    setSlices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function updateFriendSlice(idx, patch) {
    setFriendSlices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function formSlicesHadGuestContact() {
    return slices.some(
      (sl) =>
        sl.isGuest &&
        (String(sl.guestEmail || '').trim() || String(sl.guestPhone || '').trim()),
    )
  }

  function friendSlicesHadGuestContact() {
    return friendSlices.some(
      (sl) =>
        sl.isGuest &&
        (String(sl.guestEmail || '').trim() || String(sl.guestPhone || '').trim()),
    )
  }

  async function submit() {
    if (!supabaseClient || !userId) return
    onSavingChange(true)
    setFormError('')
    try {
      let createdDeal = null
      let beforeTermsEdit = null
      let afterTermsEdit = null
      if (isEdit && showPlayerTermsForm) {
        if (!isBackerPropose) {
          beforeTermsEdit = buildStakeTermsEditNotifyPayload(editDeal, editSlices)
        }
        const baselineAmount = parseMoneyInputNumber(baseline)
        if (!baseline.trim() || !Number.isFinite(baselineAmount) || baselineAmount <= 0) {
          throw new Error('Enter a baseline stake.')
        }
        const parsedSlices = []
        const reassignments = []
        for (const sl of slices) {
          const parsed = await resolveUserSlice(supabaseClient, sl, userId)
          if (
            editDeal.status === 'active' &&
            sl.sliceId &&
            sl.wasGuest &&
            !sl.isGuest
          ) {
            reassignments.push({ sliceId: sl.sliceId, stakerUserId: parsed.stakerUserId })
          } else {
            parsedSlices.push(parsed)
          }
        }
        const dealFields = {
          label,
          baselineBankroll: baselineAmount,
          startingRoll:
            isMigration && startingRoll.trim()
              ? parseMoneyInputNumber(startingRoll)
              : baselineAmount,
          isMigration,
          stakeWideStartingPl: stakeWidePl.trim() ? parseMoneyInputNumber(stakeWidePl) : null,
          lifetimePlDisplay: lifetimePl.trim() ? parseMoneyInputNumber(lifetimePl) : null,
        }
        if (isBackerPropose) {
          const payload = buildTermsPayload({
            label,
            baseline: baselineAmount,
            isMigration,
            startingRoll: dealFields.startingRoll,
            stakeWidePl: dealFields.stakeWideStartingPl,
            lifetimePl: dealFields.lifetimePlDisplay,
            slices: parsedSlices,
          })
          const { error } = await proposePendingDealTerms(
            supabaseClient,
            editDeal.id,
            userId,
            payload,
          )
          if (error) throw error
        } else if (isStakeeCounter) {
          const payload = buildTermsPayload({
            label,
            baseline: baselineAmount,
            isMigration,
            startingRoll: dealFields.startingRoll,
            stakeWidePl: dealFields.stakeWideStartingPl,
            lifetimePl: dealFields.lifetimePlDisplay,
            slices: parsedSlices,
          })
          const { error } = await stakeeProposeCounterTerms(supabaseClient, editDeal.id, payload)
          if (error) throw error
        } else {
          if (
            (editDeal.status === 'pending' || editDeal.status === 'revoked') &&
            !parsedSlices.length
          ) {
            throw new Error('Add at least one backer slice.')
          }
          const { deal, error } = await applyStakeeDealTerms(supabaseClient, {
            dealId: editDeal.id,
            stakeeUserId: userId,
            dealFields,
            slices: parsedSlices,
          })
          if (error) throw error
          createdDeal = deal
          afterTermsEdit = buildStakeTermsEditNotifyPayload(createdDeal, parsedSlices)
          for (const reassignment of reassignments) {
            const { error: reassignErr } = await reassignGuestSliceToUser(
              supabaseClient,
              reassignment,
            )
            if (reassignErr) throw reassignErr
          }
        }
      } else if (isBacker) {
        const allSlices = [
          await resolveUserSlice(
            supabaseClient,
            { ...mySlice, stakerUserId: userId, handle: '', selectedProfile: null },
            userId,
            { allowSelf: true },
          ),
        ]
        for (const sl of friendSlices) {
          allSlices.push(await resolveUserSlice(supabaseClient, sl, userId))
        }

        let requestArgs = {
          stakerUserId: userId,
          dealType,
          venueKind,
          label,
          baselineBankroll: parseMoneyInputNumber(baseline) || 0,
          slices: allSlices,
        }

        if (playerIsGuest) {
          if (!playerGuestLabel.trim()) throw new Error('Guest players need a name.')
          const { email: guestPlayerEmail, phone: guestPlayerPhone } = parseGuestNotifyContact({
            email: playerGuestEmail,
            phone: playerGuestPhone,
            label: 'Guest player',
          })
          requestArgs = {
            ...requestArgs,
            stakeeGuest: {
              label: playerGuestLabel.trim(),
              phone: guestPlayerPhone,
              email: guestPlayerEmail,
            },
          }
        } else {
          const { profile, error: lookErr } = selectedPlayerProfile
            ? { profile: selectedPlayerProfile, error: null }
            : await lookupProfileByHandle(supabaseClient, playerHandle)
          if (lookErr) throw lookErr
          if (!profile?.user_id) throw new Error('Pick a player by Edge handle.')
          if (profile.user_id === userId) throw new Error('You cannot stake yourself.')
          requestArgs = {
            ...requestArgs,
            stakeeUserId: profile.user_id,
          }
        }

        const { deal, error } = await requestBackingDeal(supabaseClient, requestArgs)
        if (error) throw error
        createdDeal = deal
      } else {
        const baselineAmount = parseMoneyInputNumber(baseline)
        if (!baseline.trim() || !Number.isFinite(baselineAmount) || baselineAmount <= 0) {
          throw new Error('Enter a baseline stake.')
        }
        const parsedSlices = []
        for (const sl of slices) {
          parsedSlices.push(await resolveUserSlice(supabaseClient, sl, userId))
        }
        const { deal, error } = await createBackingDeal(supabaseClient, {
          stakeeUserId: userId,
          dealType,
          venueKind,
          label,
          baselineBankroll: baselineAmount,
          startingRoll:
            isMigration && startingRoll.trim()
              ? parseMoneyInputNumber(startingRoll)
              : baselineAmount,
          isMigration,
          stakeWideStartingPl: stakeWidePl.trim() ? parseMoneyInputNumber(stakeWidePl) : null,
          lifetimePlDisplay: lifetimePl.trim() ? parseMoneyInputNumber(lifetimePl) : null,
          slices: parsedSlices,
          activate: parsedSlices.every((s) => s.counterpartyKind === 'guest'),
        })
        if (error) throw error
        createdDeal = deal
      }
      let guestNotifyWarning = null
      if (isBacker && createdDeal?.id) {
        if (playerIsGuest) {
          const hadGuestContact =
            String(playerGuestEmail || '').trim() || String(playerGuestPhone || '').trim()
          if (hadGuestContact) {
            const { error: notifyErr, notifiedCount } = await notifyStableGuestStakee(
              supabaseClient,
              createdDeal.id,
            )
            if (notifyErr) {
              guestNotifyWarning = notifyErr.message || 'Guest player notify failed.'
              console.warn('[poker-stable] guest stakee notify failed', guestNotifyWarning)
            } else if (notifiedCount === 0) {
              guestNotifyWarning =
                'Guest player notify did not send. Check email/phone on the guest player.'
            }
          }
        }
        if (friendSlicesHadGuestContact()) {
          const { error: notifyErr, notifiedCount } = await notifyStableGuestSyndicateBackers(
            supabaseClient,
            createdDeal.id,
          )
          if (notifyErr) {
            const msg = notifyErr.message || 'Guest syndicate backer notify failed.'
            guestNotifyWarning = guestNotifyWarning ? `${guestNotifyWarning} ${msg}` : msg
            console.warn('[poker-stable] guest syndicate backer notify failed', msg)
          } else if (notifiedCount === 0) {
            const msg =
              'Guest syndicate backer notify did not send. Check email/phone on the guest slice.'
            guestNotifyWarning = guestNotifyWarning ? `${guestNotifyWarning} ${msg}` : msg
          }
        }
      } else if (!isBacker && !isBackerPropose && createdDeal?.id) {
        const hadGuestContact = formSlicesHadGuestContact()
        let notifyOpts = null
        if (beforeTermsEdit && afterTermsEdit) {
          if (!stakeTermsEditNotifyPayloadsEqual(beforeTermsEdit, afterTermsEdit)) {
            notifyOpts = {
              kind: 'terms_edited',
              termsEdit: { before: beforeTermsEdit, after: afterTermsEdit },
            }
          }
        } else if (!isEdit) {
          notifyOpts = { kind: 'offer' }
        }
        if (notifyOpts) {
          const { error: notifyErr, notifiedCount } = await notifyStableStakeGuests(
            supabaseClient,
            createdDeal.id,
            notifyOpts,
          )
          if (notifyErr) {
            guestNotifyWarning = notifyErr.message || 'Guest notify failed.'
            console.warn('[poker-stable] guest notify failed', guestNotifyWarning)
          } else if (hadGuestContact && notifiedCount === 0) {
            guestNotifyWarning = 'Guest notify did not send. Check email/phone on the guest slice.'
          }
        }
      }
      triggerTapHapticLight()
      if (isEdit) onUpdated?.(createdDeal, { guestNotifyWarning })
      else onCreated?.(createdDeal, { guestNotifyWarning })
      onClose()
    } catch (e) {
      const message = e?.message || 'Could not save deal.'
      setFormError(message)
    } finally {
      onSavingChange(false)
    }
  }

  const title = isStakeeCounter
    ? 'Offer new terms'
    : isBackerPropose
    ? 'Propose stake terms'
    : isEdit
      ? 'Edit stake terms'
      : isBacker
        ? 'Create Stake'
        : 'New stake deal'
  const submitLabel = isStakeeCounter
    ? 'Send counter-proposal'
    : isBackerPropose
    ? 'Send proposal'
    : isEdit
      ? 'Save terms'
      : isBacker
        ? 'Create stake'
        : 'Create stake'

  const playerGuestContactErrors = playerIsGuest
    ? guestNotifyContactFieldErrors({
        email: playerGuestEmail,
        phone: playerGuestPhone,
      })
    : { email: '', phone: '' }

  const guestContactFormValid =
    (!playerIsGuest ||
      guestNotifyContactFieldsValid({
        email: playerGuestEmail,
        phone: playerGuestPhone,
      })) &&
    [...slices, ...friendSlices].every(
      (sl) =>
        !sl.isGuest ||
        guestNotifyContactFieldsValid({ email: sl.guestEmail, phone: sl.guestPhone }),
    )

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        ref={sheetRef}
        data-poker-stable-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Cancel
          </button>
        </div>

        {showHorsePicker ? (
          <>
            <InField label="Player" className="mb-3" focusRingClass={STABLE_INFIELD_FOCUS}>
              <StablePlayerPicker
                supabaseClient={supabaseClient}
                userId={userId}
                value={playerIsGuest ? '' : playerHandle}
                onChange={(next) => {
                  setPlayerHandle(next)
                  if (selectedPlayerProfile) setSelectedPlayerProfile(null)
                  if (playerIsGuest && String(next || '').trim()) {
                    setPlayerIsGuest(false)
                    setPlayerGuestLabel('')
                    setPlayerGuestPhone('')
                    setPlayerGuestEmail('')
                  }
                }}
                selectedProfile={selectedPlayerProfile}
                isGuest={playerIsGuest}
                guestLabel={playerGuestLabel}
                onSelectProfile={(profile) => {
                  clearPlayerSelection()
                  setSelectedPlayerProfile(profile)
                  setPlayerHandle(String(profile.handle || '').replace(/^@+/, ''))
                }}
                onSelectGuestMode={(draftLabel) => {
                  setSelectedPlayerProfile(null)
                  setPlayerHandle('')
                  setPlayerGuestLabel(draftLabel || '')
                  setPlayerGuestPhone('')
                  setPlayerGuestEmail('')
                  setPlayerIsGuest(true)
                }}
                onClearSelection={clearPlayerSelection}
                inputClassName={INFIELD_CONTROL}
                placeholder="Select player"
                autoFocus
              />
            </InField>
            {playerIsGuest ? (
              <>
                <InField label="Guest name" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                  <input
                    value={playerGuestLabel}
                    onChange={(e) => setPlayerGuestLabel(e.target.value)}
                    placeholder="Name"
                    className={INFIELD_CONTROL}
                  />
                </InField>
                <InField label="Phone (optional SMS)" className="mb-2" focusRingClass={STABLE_INFIELD_FOCUS}>
                  <input
                    value={playerGuestPhone}
                    onChange={(e) => setPlayerGuestPhone(e.target.value)}
                    placeholder="Phone (optional SMS)"
                    inputMode="tel"
                    autoComplete="tel"
                    className={INFIELD_CONTROL}
                    aria-invalid={playerGuestContactErrors.phone ? 'true' : undefined}
                  />
                </InField>
                {playerGuestContactErrors.phone ? (
                  <p className="mb-2 text-[11px] text-rose-400">{playerGuestContactErrors.phone}</p>
                ) : null}
                <InField label="Email (optional)" className="mb-3" focusRingClass={STABLE_INFIELD_FOCUS}>
                  <input
                    value={playerGuestEmail}
                    onChange={(e) => setPlayerGuestEmail(e.target.value)}
                    placeholder="Email (optional)"
                    inputMode="email"
                    autoComplete="email"
                    className={INFIELD_CONTROL}
                    aria-invalid={playerGuestContactErrors.email ? 'true' : undefined}
                  />
                </InField>
                {playerGuestContactErrors.email ? (
                  <p className="mb-3 text-[11px] text-rose-400">{playerGuestContactErrors.email}</p>
                ) : null}
                <p className="mb-3 text-[11px] leading-snug text-zinc-500">
                  Phone/email optional ... only used to notify them about this stake.
                </p>
              </>
            ) : null}
          </>
        ) : null}

        <InField label="Deal label" className="mb-3" focusRingClass={STABLE_INFIELD_FOCUS}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isBacker ? '50/50 makeup' : '$10/20 backing'}
            className={INFIELD_CONTROL}
          />
        </InField>

        {!isEdit ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <InField label="Stake type" focusRingClass={STABLE_INFIELD_FOCUS}>
              <select
                value={dealType}
                onChange={(e) => onDealTypeChange(e.target.value)}
                className={`${INFIELD_CONTROL} appearance-none`}
                data-poker-stable-deal-type-select
              >
                <option value="cash_backing">Cash game</option>
                <option value="tournament_package">Tournament package</option>
              </select>
            </InField>
            <InField label="Venue" focusRingClass={STABLE_INFIELD_FOCUS}>
              <select
                value={venueKind}
                onChange={(e) => onVenueKindChange(e.target.value)}
                className={`${INFIELD_CONTROL} appearance-none`}
                data-poker-stable-venue-kind-select
              >
                <option value="live">Live</option>
                <option value="online">Online</option>
              </select>
            </InField>
          </div>
        ) : null}

        {showPlayerTermsForm ? (
          <>
            <MoneyInputField
              label="Baseline stake"
              value={baseline}
              onChange={setBaseline}
              placeholder="100,000"
              inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
              className="mb-3"
            />
            <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={isMigration}
                onChange={(e) => setIsMigration(e.target.checked)}
                className="rounded"
              />
              Migrate an existing deal
            </label>
            {isMigration ? (
              <>
                <MoneyInputField
                  label="Current roll"
                  value={startingRoll}
                  onChange={setStartingRoll}
                  placeholder="Same as baseline if empty"
                  inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
                  className="mb-3"
                />
                <MoneyInputField
                  label="Stake-wide starting P/L"
                  value={stakeWidePl}
                  onChange={setStakeWidePl}
                  placeholder="Negative = makeup"
                  allowNegative
                  inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
                  className="mb-3"
                />
                <MoneyInputField
                  label="Lifetime P/L display"
                  value={lifetimePl}
                  onChange={setLifetimePl}
                  allowNegative
                  inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
                  className="mb-4"
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <MoneyInputField
              label="Stake baseline"
              value={baseline}
              onChange={setBaseline}
              placeholder="100,000"
              inFieldFocusRingClass={STABLE_INFIELD_FOCUS}
              className="mb-3"
            />
            <p
              className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-zinc-500"
              data-poker-stable-backing-bankroll-available
            >
              Available bankroll:{' '}
              <span
                className={`font-bold tabular-nums ${
                  backerAvailableBankrollDisplay < 0 ? 'text-rose-400' : 'text-zinc-300'
                }`}
              >
                {fmtPoker$(backerAvailableBankrollDisplay)}
              </span>
            </p>
          </>
        )}

        {showPlayerTermsForm ? (
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            Backer slices
          </h4>
        ) : null}
        <div className="mb-4 space-y-3">
          {showPlayerTermsForm ? (
            slices.map((sl, idx) => (
              <SliceEditor
                key={idx}
                sl={sl}
                idx={idx}
                sliceIndex={idx}
                userId={userId}
                supabaseClient={supabaseClient}
                title={pokerStableBackerSliceLabel(slices.length, idx)}
                canRemove={slices.length > 1}
                showRakeback={venueKind === 'online'}
                onChange={(patch) => updateSlice(idx, patch)}
                onRemove={() => setSlices((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))
          ) : (
            <>
              <SliceEditor
                sl={mySlice}
                idx={0}
                sliceIndex={0}
                userId={userId}
                supabaseClient={supabaseClient}
                lockUserId={userId}
                title="Your slice"
                canRemove={false}
                showRakeback={venueKind === 'online'}
                onChange={(patch) => setMySlice((prev) => ({ ...prev, ...patch }))}
              />
              {friendSlices.map((sl, idx) => (
                <SliceEditor
                  key={idx}
                  sl={sl}
                  idx={idx + 1}
                  sliceIndex={idx + 1}
                  userId={userId}
                  supabaseClient={supabaseClient}
                  title={`Syndicate slice ${idx + 1}`}
                  canRemove
                  showRakeback={venueKind === 'online'}
                  onChange={(patch) => updateFriendSlice(idx, patch)}
                  onRemove={() => setFriendSlices((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </>
          )}
        </div>

        <div ref={actionsRef} data-poker-stable-sheet-actions>
        {formError ? (
          <p
            data-poker-stable-form-error
            className="mb-3 rounded-2xl border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-center text-sm text-rose-300"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
        {showPlayerTermsForm ? (
        <button
          type="button"
          onClick={addBackerSlice}
          className="mb-4 w-full rounded-2xl border border-dashed border-zinc-600 py-2.5 text-sm font-semibold text-zinc-400 touch-manipulation"
        >
          + Add backer slice
        </button>
        ) : (
        <button
          type="button"
          onClick={addBackerSlice}
          className="mb-4 w-full rounded-2xl border border-dashed border-zinc-600 py-2.5 text-sm font-semibold text-zinc-400 touch-manipulation"
        >
          + Add syndicate backer
        </button>
        )}

        <button
          type="button"
          disabled={saving || !guestContactFormValid}
          onClick={() => void submit()}
          data-poker-stable-primary-btn
          className="w-full rounded-3xl bg-amber-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        </div>
      </div>
    </div>
  )
}
