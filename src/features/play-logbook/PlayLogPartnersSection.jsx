import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import PlayLogPartnerPickerModal from './PlayLogPartnerPickerModal.jsx'
import {
  formatPlayLogPartnerOutcomeShare,
  playLogPartnersEnsureCreatorRow,
  playLogPartnersHasExtraPartner,
  playLogPartnersSplitForDisplay,
  playLogPartnerLabel,
  playLogPartnerOutcomeShareToneClass,
  playLogPartnerOutcomeShareUsdRounded,
  playLogPartnersEnsureManager,
  playLogPartnersPercentSum,
  playLogPartnersWithManager,
} from './playLogPartners.js'
import { addSavedGuestLabel } from './playLogSavedGuests.js'

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   userId: string,
 *   ownerUserId?: string,
 *   viewerProfile?: { handle?: string, display_name?: string } | null,
 *   partners: import('./playLogPartners.js').PlayLogPartnerRow[],
 *   onPartnersChange: (rows: import('./playLogPartners.js').PlayLogPartnerRow[]) => void,
 *   readOnly?: boolean,
 *   canEditManager?: boolean,
 *   canEditPaid?: boolean,
 *   netOutcome?: number | null,
 *   onPaidPersist?: (rows: import('./playLogPartners.js').PlayLogPartnerRow[]) => void | Promise<void>,
 *   onPaidPersistError?: (error: unknown) => void,
 * }} props
 */
export default function PlayLogPartnersSection({
  supabaseClient,
  userId,
  ownerUserId = userId,
  viewerProfile,
  partners,
  onPartnersChange,
  readOnly = false,
  canEditManager = true,
  canEditPaid = false,
  netOutcome = null,
  onPaidPersist = null,
  onPaidPersistError = null,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [paidSaving, setPaidSaving] = useState(false)

  const hasExtraPartner = useMemo(
    () => playLogPartnersHasExtraPartner(partners, ownerUserId),
    [partners, ownerUserId],
  )
  const displayPartners = useMemo(() => {
    if (readOnly || hasExtraPartner) return partners
    return []
  }, [partners, readOnly, hasExtraPartner])

  const percentSum = useMemo(() => playLogPartnersPercentSum(partners), [partners])
  const sumOk = Math.abs(percentSum - 100) < 0.02
  const showPaidColumn =
    canEditPaid || partners.some(p => p.paid) || partners.some(p => p.isManager)

  const usedUserIds = useMemo(
    () => new Set(partners.filter(p => p.kind === 'user').map(p => String(p.userId))),
    [partners],
  )
  const usedGuestLabels = useMemo(
    () =>
      new Set(
        partners
          .filter(p => p.kind === 'guest')
          .map(p => String(p.guestLabel || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    [partners],
  )
  const { users: displayUserRows, guests: displayGuestRows } = useMemo(
    () => playLogPartnersSplitForDisplay(displayPartners),
    [displayPartners],
  )

  const updateRow = (key, patch) => {
    onPartnersChange(partners.map(row => (row.key === key ? { ...row, ...patch } : row)))
  }

  const setManager = key => {
    onPartnersChange(playLogPartnersWithManager(partners, key))
  }

  const togglePaid = async (key, nextPaid) => {
    const prior = partners
    const next = prior.map(row => (row.key === key ? { ...row, paid: nextPaid } : row))
    onPartnersChange(next)
    if (!onPaidPersist) return
    setPaidSaving(true)
    try {
      await onPaidPersist(next)
    } catch (e) {
      onPartnersChange(prior)
      onPaidPersistError?.(e)
    } finally {
      setPaidSaving(false)
    }
  }

  const removeRow = key => {
    let next = partners.filter(row => row.key !== key)
    if (!playLogPartnersHasExtraPartner(next, ownerUserId)) {
      onPartnersChange([])
      return
    }
    if (!next.some(r => r.isManager)) {
      next = playLogPartnersEnsureManager(next, ownerUserId)
    }
    onPartnersChange(next)
  }

  const commitPartnersFromPicker = ({ profiles = [], guestLabels = [] }) => {
    let next = playLogPartnersEnsureCreatorRow(partners, ownerUserId, userId, viewerProfile)
    const seen = new Set(usedUserIds)
    let changed = next.length !== partners.length

    for (const profile of profiles) {
      const uid = String(profile?.user_id || '').trim()
      if (!uid || seen.has(uid)) continue
      seen.add(uid)
      changed = true
      next.push({
        key: `user:${uid}`,
        kind: 'user',
        userId: uid,
        handle: profile?.handle || '',
        displayName: profile?.display_name || '',
        avatarUrl: profile?.avatar_url || '',
        sharePercent: '',
        isManager: false,
        paid: false,
      })
    }

    for (const rawLabel of guestLabels) {
      const label = String(rawLabel || '').trim()
      if (!label) continue
      addSavedGuestLabel(userId, label)
      changed = true
      next.push({
        key: `guest:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'guest',
        guestLabel: label,
        sharePercent: '',
        isManager: false,
        paid: false,
      })
    }

    if (changed) onPartnersChange(next)
    setPickerOpen(false)
  }

  const partnerNameContent = row => (
    <>
      {row.kind === 'guest' ? (
        row.guestLabel
      ) : (
        playLogPartnerLabel({ display_name: row.displayName, handle: row.handle })
      )}
      {row.kind === 'user' && String(row.userId) === String(userId) ? (
        <span className="text-zinc-500"> (you)</span>
      ) : row.kind === 'user' && String(row.userId) === String(ownerUserId) ? (
        <span
          className={
            row.isManager
              ? 'play-log-manager-owner-tag text-amber-300/70 font-normal'
              : 'text-cyan-300/90 font-normal'
          }
        >
          {' '}(owner)
        </span>
      ) : null}
    </>
  )

  const partnerIsOwner = row =>
    row.kind === 'user' && String(row.userId) === String(ownerUserId)

  /** Manager = amber; owner (when someone else manages) = cyan; else zinc. */
  const partnerNameClass = row => {
    if (row.isManager) return 'play-log-manager-name text-amber-300 font-semibold'
    if (partnerIsOwner(row)) return 'text-cyan-300 font-semibold'
    return 'text-zinc-200'
  }

  const canRemoveRow = row => {
    if (row.kind === 'user' && String(row.userId) === String(ownerUserId)) {
      return hasExtraPartner
    }
    return true
  }

  const showManagerNameHint = !readOnly && canEditManager && hasExtraPartner

  const partnersCardTitle = (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex min-w-0 items-center gap-1">
        <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Partners</div>
        {!readOnly ? <PlayLogPartnersInfoButton hasExtraPartner={hasExtraPartner} /> : null}
      </div>
      {hasExtraPartner ? (
        <span
          className={`text-xs font-semibold tabular-nums ${sumOk ? 'text-emerald-400' : 'text-amber-400'}`}
        >
          Total: {percentSum.toFixed(1)}%
        </span>
      ) : null}
    </div>
  )

  const partnerColumnHeader = (
    <div className="flex items-center gap-2 mb-1">
      <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Partner
      </span>
      <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span className="w-12 text-right">Share</span>
        <span className="min-w-[4.75rem] text-right">Amount</span>
        {showPaidColumn ? <span className="w-6 text-center">Paid</span> : null}
      </div>
      {!readOnly ? <span className="w-4 shrink-0" aria-hidden /> : null}
    </div>
  )

  const managerNameHint = showManagerNameHint ? (
    <p className="text-zinc-600 text-[10px] mb-1.5 font-normal normal-case tracking-normal">
      Tap name to set manager
    </p>
  ) : null

  const renderPartnerRow = row => (
    <li key={row.key} className="flex items-center gap-2">
      {!readOnly && canEditManager && row.kind === 'user' ? (
        <button
          type="button"
          onClick={() => setManager(row.key)}
          className={`min-w-0 flex-1 text-left text-sm truncate touch-manipulation active:opacity-80 ${partnerNameClass(row)}`}
          aria-label={`${row.isManager ? 'Play manager' : 'Set as play manager'}: ${playLogPartnerLabel(row)}`}
          aria-pressed={Boolean(row.isManager)}
        >
          {partnerNameContent(row)}
        </button>
      ) : (
        <div className={`min-w-0 flex-1 text-sm truncate ${partnerNameClass(row)}`}>
          {partnerNameContent(row)}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2">
        {readOnly ? (
          <span className="flex h-4 w-12 items-center justify-end text-cyan-300 text-xs font-semibold tabular-nums leading-none">
            {row.sharePercent}%
          </span>
        ) : (
          <input
            type="text"
            inputMode="decimal"
            value={row.sharePercent}
            onChange={e => updateRow(row.key, { sharePercent: e.target.value })}
            placeholder="0"
            className="w-12 min-h-8 rounded-lg bg-zinc-900 px-1 text-right text-sm text-white font-semibold tabular-nums outline-none focus:ring-2 focus:ring-cyan-500/40"
            aria-label="Share percent"
          />
        )}
        <div
          className={`flex min-w-[4.75rem] items-center justify-end ${readOnly ? 'h-4' : 'min-h-8'}`}
        >
          <PartnerShareAmount netOutcome={netOutcome} sharePercent={row.sharePercent} />
        </div>
        {showPaidColumn ? (
          <div className={`flex w-6 items-center justify-center ${readOnly ? 'h-4' : 'min-h-8'}`}>
            <PaidCheckbox
              checked={Boolean(row.paid)}
              disabled={!canEditPaid || paidSaving}
              onChange={next => void togglePaid(row.key, next)}
            />
          </div>
        ) : null}
      </div>
      {!readOnly && canRemoveRow(row) ? (
        <button
          type="button"
          onClick={() => removeRow(row.key)}
          className="shrink-0 text-zinc-500 text-xs font-semibold px-1 touch-manipulation active:text-red-400"
          aria-label={row.kind === 'guest' ? `Remove guest ${row.guestLabel}` : 'Remove partner'}
        >
          ×
        </button>
      ) : readOnly ? null : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
    </li>
  )

  const partnerListBody = (
    <div className="space-y-3 mb-3">
      {displayUserRows.length > 0 ? (
        <div>
          <ul className="space-y-2">{displayUserRows.map(renderPartnerRow)}</ul>
        </div>
      ) : null}
      {displayGuestRows.length > 0 ? (
        <div>
          <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide mb-1.5 px-0.5">
            Guests
          </p>
          <ul className="space-y-2">{displayGuestRows.map(renderPartnerRow)}</ul>
        </div>
      ) : null}
    </div>
  )

  const partnerList = (
    <>
      {managerNameHint}
      {partnerColumnHeader}
      {partnerListBody}
    </>
  )

  if (readOnly) {
    return (
      <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700/50 p-3">
        {partnersCardTitle}
        {displayPartners.length > 0 ? partnerList : null}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700/50 p-3">
      {partnersCardTitle}

      {displayPartners.length > 0 ? partnerList : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="w-full min-h-11 rounded-xl bg-zinc-900 border border-zinc-700/60 px-3 py-2 text-sm font-semibold text-cyan-300 touch-manipulation active:bg-zinc-800 mb-2"
      >
        + Add partner
      </button>

      <PlayLogPartnerPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        supabaseClient={supabaseClient}
        userId={userId}
        usedUserIds={usedUserIds}
        usedGuestLabels={usedGuestLabels}
        onConfirm={commitPartnersFromPicker}
      />
    </div>
  )
}

const PARTNERS_INFO_POPOVER_MARGIN = 12
const PARTNERS_INFO_POPOVER_GAP = 6

/** @param {HTMLElement} anchorEl @param {HTMLElement} panelEl */
function layoutPartnersInfoPopover(anchorEl, panelEl) {
  const ar = anchorEl.getBoundingClientRect()
  const pw = panelEl.offsetWidth
  const ph = panelEl.offsetHeight
  const margin = PARTNERS_INFO_POPOVER_MARGIN
  const gap = PARTNERS_INFO_POPOVER_GAP
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = ar.left
  if (left + pw > vw - margin) left = vw - margin - pw
  if (left < margin) left = margin

  const belowTop = ar.bottom + gap
  const aboveTop = ar.top - gap - ph
  let top = belowTop
  if (belowTop + ph > vh - margin && aboveTop >= margin) top = aboveTop
  else if (belowTop + ph > vh - margin) top = Math.max(margin, vh - margin - ph)
  top = Math.max(margin, Math.min(top, vh - margin - ph))

  return { left, top }
}

/** @param {{ hasExtraPartner: boolean }} props */
function PlayLogPartnersInfoButton({ hasExtraPartner }) {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState(/** @type {{ left: number, top: number } | null} */ (null))
  const anchorRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const popoverRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const repositionPopover = useCallback(() => {
    const anchor = anchorRef.current
    const panel = popoverRef.current
    if (!anchor || !panel) return
    setPopoverPos(layoutPartnersInfoPopover(anchor, panel))
  }, [])

  const closePopover = useCallback(() => setOpen(false), [])

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPos(null)
      return undefined
    }
    repositionPopover()
    const onReflow = () => repositionPopover()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, repositionPopover, hasExtraPartner])

  const popoverLayer =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 cursor-default bg-black/40 touch-none"
              style={{ zIndex: Z_APP_ALERT - 1 }}
              aria-label="Close partners info"
              onPointerDown={e => {
                e.preventDefault()
                e.stopPropagation()
                closePopover()
              }}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
              }}
            />
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="Partners info"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: popoverPos?.left ?? -9999,
                top: popoverPos?.top ?? -9999,
                zIndex: Z_APP_ALERT,
                visibility: popoverPos ? 'visible' : 'hidden',
                maxHeight: `calc(100dvh - ${PARTNERS_INFO_POPOVER_MARGIN * 2}px)`,
              }}
              className="w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-zinc-600/80 bg-zinc-800 px-3 py-2.5 text-left text-xs leading-snug text-zinc-300 shadow-lg"
            >
              {hasExtraPartner ? (
                <p>
                  The <span className="text-cyan-300/90">owner</span> is the{' '}
                  <span className="text-amber-300/90">manager</span> by default. Tap a partner&apos;s name to transfer
                  management. <span className="text-amber-300/90">Managers</span> are considered &quot;paid&quot; by
                  default. Edge registered partners receive this play in their logbook. Guests are attribution only.
                </p>
              ) : (
                <p>
                  Tap Add partner to search your network or type a name to add a guest. Your row appears once you add
                  someone.
                </p>
              )}
            </div>
          </>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-label="Partners info"
        onClick={e => {
          e.stopPropagation()
          setOpen(prev => !prev)
        }}
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 touch-manipulation active:bg-zinc-700/60 active:text-zinc-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {popoverLayer}
    </>
  )
}

/** @param {{ checked: boolean, disabled?: boolean, onChange: (next: boolean) => void }} props */
function PaidCheckbox({ checked, disabled = false, onChange }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      aria-label="Paid"
      className="block h-3.5 w-3.5 shrink-0 rounded border-zinc-600 bg-zinc-900 accent-cyan-500 disabled:opacity-40"
    />
  )
}

/** @param {{ netOutcome: number | null, sharePercent: string }} props */
function PartnerShareAmount({ netOutcome, sharePercent }) {
  const usd = playLogPartnerOutcomeShareUsdRounded(netOutcome, sharePercent)
  const label = formatPlayLogPartnerOutcomeShare(netOutcome, sharePercent)
  if (!label) {
    return <span className="text-zinc-600 text-xs font-semibold tabular-nums">-</span>
  }
  return (
    <span
      className={`text-xs font-bold tabular-nums whitespace-nowrap ${playLogPartnerOutcomeShareToneClass(usd)}`}
      title="Share of session net win/loss"
    >
      {label}
    </span>
  )
}
