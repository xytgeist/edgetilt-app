import { useEffect, useMemo, useState } from 'react'
import {
  formatPlayLogLedgerUsd,
  playLogLedgerSettlementView,
} from './playLogLedger.js'

/**
 * @param {{
 *   ledger: ReturnType<import('./playLogLedger.js').buildPlayLogLedger>,
 *   settlements?: object[],
 *   viewerUserId?: string | null,
 *   onOpenEntry: (entryId: string) => void,
 *   onSettleAll?: (counterpartKey?: string | null) => void | Promise<void>,
 *   onAcceptSettlement?: (settlementId: string) => void | Promise<void>,
 *   onDeclineSettlement?: (settlementId: string) => void | Promise<void>,
 *   settling?: boolean,
 *   initialCounterpartKey?: string | null,
 *   focusIncomingSettlement?: boolean,
 *   onFocusIncomingConsumed?: () => void,
 * }} props
 */
export default function PlayLogLedgerTab({
  ledger,
  settlements = [],
  viewerUserId,
  onOpenEntry,
  onSettleAll,
  onAcceptSettlement,
  onDeclineSettlement,
  settling = false,
  initialCounterpartKey = null,
  focusIncomingSettlement = false,
  onFocusIncomingConsumed,
}) {
  const [selectedKey, setSelectedKey] = useState(/** @type {string | null} */ (null))
  const [focusedSettlementId, setFocusedSettlementId] = useState(/** @type {string | null} */ (null))
  const counterparts = ledger?.counterparts || []

  const settlementViews = useMemo(
    () =>
      (settlements || [])
        .map(row => playLogLedgerSettlementView(row, viewerUserId))
        .filter(row => row.counterpartKey),
    [settlements, viewerUserId],
  )

  const partnerRows = useMemo(() => {
    const byKey = new Map()
    for (const row of counterparts) byKey.set(row.key, row)
    for (const row of settlementViews) {
      if (!row.counterpartKey || byKey.has(row.counterpartKey)) continue
      const isGuest = row.counterpartKey.startsWith('guest:')
      byKey.set(row.counterpartKey, {
        key: row.counterpartKey,
        kind: isGuest ? 'guest' : 'user',
        userId: isGuest ? '' : row.counterpartKey.slice('user:'.length),
        guestLabel: isGuest ? row.otherLabel : '',
        handle: '',
        label: row.otherLabel,
        theyOweYou: 0,
        youOweThem: 0,
        net: 0,
        plays: [],
        openPlays: [],
        closedPlays: [],
        settleablePlayCount: 0,
      })
    }
    return [...byKey.values()].sort((a, b) => {
      const aOpen = Math.abs(a.net)
      const bOpen = Math.abs(b.net)
      if (bOpen !== aOpen) return bOpen - aOpen
      return String(a.label).localeCompare(String(b.label), undefined, {
        sensitivity: 'base',
      })
    })
  }, [counterparts, settlementViews])

  const selected = partnerRows.find(row => row.key === selectedKey) || null

  const selectedSettlements = useMemo(
    () => settlementViews.filter(row => row.counterpartKey === selectedKey),
    [settlementViews, selectedKey],
  )

  const pendingIncoming = useMemo(
    () => selectedSettlements.filter(row => settlementAcceptVisible(row, partnerRows)),
    [selectedSettlements, partnerRows],
  )

  const focusedSettlement =
    selectedSettlements.find(row => String(row.id) === String(focusedSettlementId)) || null

  useEffect(() => {
    if (initialCounterpartKey) setSelectedKey(initialCounterpartKey)
  }, [initialCounterpartKey])

  useEffect(() => {
    if (!selectedKey) return
    if (initialCounterpartKey && selectedKey === initialCounterpartKey) return
    if (!partnerRows.length) return
    if (!partnerRows.some(row => row.key === selectedKey)) setSelectedKey(null)
  }, [partnerRows, selectedKey, initialCounterpartKey])

  useEffect(() => {
    if (!focusIncomingSettlement || !selectedKey) return
    const pending = pendingIncoming[0]
    if (pending?.id) {
      setFocusedSettlementId(String(pending.id))
      onFocusIncomingConsumed?.()
      return
    }
    if (settlementViews.length || partnerRows.length) onFocusIncomingConsumed?.()
  }, [
    focusIncomingSettlement,
    selectedKey,
    pendingIncoming,
    settlementViews.length,
    partnerRows.length,
    onFocusIncomingConsumed,
  ])

  useEffect(() => {
    if (!focusedSettlementId) return
    if (!selectedSettlements.some(row => String(row.id) === String(focusedSettlementId))) {
      setFocusedSettlementId(null)
    }
  }, [focusedSettlementId, selectedSettlements])

  if (selected && focusedSettlement && (settlementAcceptVisible(focusedSettlement, partnerRows) || focusedSettlement.leftOpenByYou)) {
    return (
      <div data-play-logbook-ledger>
        <button
          type="button"
          onClick={() => setFocusedSettlementId(null)}
          className="mb-4 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-cyan-300 touch-manipulation active:opacity-80"
        >
          ← {selected.label}
        </button>
        <div className="mb-4">
          <h2 className="text-white text-lg font-bold">They settled their books</h2>
          <p className="text-zinc-500 text-xs mt-1 leading-snug">
            This closed {selected.label} on their side. Yours stay open until you update, or remain
            unsettled.
          </p>
        </div>
        <LedgerSettlementCard
          row={focusedSettlement}
          showActions
          showRemain={Boolean(focusedSettlement.needsAccept)}
          settling={settling}
          onAccept={() => void onAcceptSettlement?.(focusedSettlement.id)}
          onDecline={() => void onDeclineSettlement?.(focusedSettlement.id)}
        />
      </div>
    )
  }

  if (selected) {
        const openPlays = selected.openPlays || selected.plays?.filter(play => !play.paid) || []
        const closedPlays = selected.closedPlays || selected.plays?.filter(play => play.paid) || []
        const hideSettleAll = pendingIncoming.length > 0
    return (
      <div data-play-logbook-ledger>
        <button
          type="button"
          onClick={() => {
            setFocusedSettlementId(null)
            setSelectedKey(null)
          }}
          className="mb-4 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-cyan-300 touch-manipulation active:opacity-80"
        >
          ← All
        </button>
        <div className="mb-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-white text-lg font-bold">{selected.label}</h2>
            {selected.kind === 'guest' ? (
              <span className="shrink-0 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                Guest
              </span>
            ) : selected.handle ? (
              <span className="min-w-0 truncate text-zinc-500 text-xs">
                @{String(selected.handle).trim().replace(/^@/, '')}
              </span>
            ) : null}
          </div>
          <LedgerPairTotals theyOweYou={selected.theyOweYou} youOweThem={selected.youOweThem} />
          {!hideSettleAll && selected.settleablePlayCount > 0 ? (
            <LedgerSettleAllButton
              settling={settling}
              onClick={() => void onSettleAll?.(selected.key)}
            />
          ) : null}
        </div>

        <LedgerSectionLabel>Open plays</LedgerSectionLabel>
        {openPlays.length ? (
          <div className="space-y-2 mb-5">
            {openPlays.map(play => (
              <LedgerPlayCard
                key={`${play.sessionId}:${play.entryId}`}
                play={play}
                settling={settling}
                onOpen={() => onOpenEntry(play.entryId)}
              />
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-xs mb-5 px-1">No open plays with this partner.</p>
        )}

        <LedgerSettlementList
          rows={selectedSettlements}
          partnerRows={partnerRows}
          settling={settling}
          onAcceptSettlement={onAcceptSettlement}
          onDeclineSettlement={onDeclineSettlement}
          onOpenSettlement={row => setFocusedSettlementId(String(row.id))}
          emptyHint="Settle All with this partner shows up here."
        />

        {closedPlays.length ? (
          <>
            <LedgerSectionLabel className="mt-5">Closed plays</LedgerSectionLabel>
            <div className="space-y-2">
              {closedPlays.map(play => (
                <LedgerPlayCard
                  key={`${play.sessionId}:${play.entryId}`}
                  play={play}
                  settling={settling}
                  onOpen={() => onOpenEntry(play.entryId)}
                />
              ))}
            </div>
          </>
        ) : null}

        <p className="text-zinc-500 text-xs mt-4 px-1">
          {hideSettleAll
            ? 'They already settled. Update your books or remain unsettled.'
            : selected.settleablePlayCount > 0
              ? 'Settle All only squares this person on your books. They get an alert to update theirs.'
              : 'Tap a play to open it. Closed plays stay on this book.'}
        </p>
      </div>
    )
  }

  if (ledger?.hasSharedPlays && !ledger?.partnersLoaded) {
    return (
      <div
        className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-6 text-center"
        data-play-logbook-card
        data-play-logbook-ledger
      >
        <div className="text-zinc-400 text-sm">Could not load partner balances.</div>
        <div className="text-zinc-500 text-xs mt-1">
          Open Logbook again in a moment. Shared plays are still on LOG.
        </div>
      </div>
    )
  }

  if (!partnerRows.length) {
    return (
      <div
        className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-6 text-center"
        data-play-logbook-card
        data-play-logbook-ledger
      >
        <div className="text-zinc-400 text-sm">No shared partners yet.</div>
        <div className="text-zinc-500 text-xs mt-1">
          Add a partner when you log a play. That person stays on this book.
        </div>
      </div>
    )
  }

  return (
    <div data-play-logbook-ledger>
      <div
        className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4 mb-4"
        data-play-logbook-card
      >
        <LedgerPairTotals theyOweYou={ledger.theyOweYouTotal} youOweThem={ledger.youOweThemTotal} />
        {ledger.settleablePlayCount > 0 ? (
          <LedgerSettleAllButton
            settling={settling}
            onClick={() => void onSettleAll?.(null)}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Partner
        </span>
        <span className="w-[4.75rem] shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          They owe you
        </span>
        <span className="w-[4.75rem] shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          You owe them
        </span>
      </div>
      <div className="space-y-2">
        {partnerRows.map(row => (
          <button
            key={row.key}
            type="button"
            onClick={() => setSelectedKey(row.key)}
            className="w-full text-left rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4 touch-manipulation cursor-pointer active:bg-zinc-800/90"
            data-play-logbook-card
            data-play-logbook-entry
          >
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-white font-bold">{row.label}</span>
                  {row.kind === 'guest' ? (
                    <span className="shrink-0 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                      Guest
                    </span>
                  ) : null}
                </div>
                <div className="text-zinc-500 text-xs mt-0.5">
                  {row.openPlays?.length
                    ? `${row.openPlays.length} open`
                    : 'Squared'}
                  {` · ${row.plays.length === 1 ? '1 play' : `${row.plays.length} plays`}`}
                  {settlementViews.some(
                    s =>
                      s.counterpartKey === row.key &&
                      settlementAcceptVisible(s, partnerRows),
                  )
                    ? ' · Update your books'
                    : settlementViews.some(
                          s => s.counterpartKey === row.key && s.waitingOnThem,
                        )
                      ? ' · Waiting on them'
                      : ''}
                  {row.handle && row.kind === 'user'
                    ? ` · @${String(row.handle).trim().replace(/^@/, '')}`
                    : ''}
                </div>
              </div>
              <span
                className={`w-[4.75rem] shrink-0 text-right text-sm font-bold tabular-nums ${
                  row.theyOweYou > 0 ? 'text-emerald-300' : 'text-zinc-500'
                }`}
              >
                {row.theyOweYou > 0 ? formatPlayLogLedgerUsd(row.theyOweYou) : '$0'}
              </span>
              <span
                className={`w-[4.75rem] shrink-0 text-right text-sm font-bold tabular-nums ${
                  row.youOweThem > 0 ? 'text-red-300' : 'text-zinc-500'
                }`}
              >
                {row.youOweThem > 0 ? formatPlayLogLedgerUsd(row.youOweThem) : '$0'}
              </span>
            </div>
          </button>
        ))}
      </div>

      <LedgerSettlementList
        className="mt-5"
        rows={settlementViews}
        partnerRows={partnerRows}
        settling={settling}
        onAcceptSettlement={onAcceptSettlement}
        onDeclineSettlement={onDeclineSettlement}
        onOpenSettlement={row => {
          if (row.counterpartKey) setSelectedKey(row.counterpartKey)
          setFocusedSettlementId(String(row.id))
        }}
        emptyHint="Settle All between you and a partner shows up here."
      />
    </div>
  )
}

/** @param {{ children: import('react').ReactNode, className?: string }} props */
function LedgerSectionLabel({ children, className = '' }) {
  return (
    <div
      className={`text-zinc-500 text-xs font-semibold uppercase tracking-wide px-1 mb-1 ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * @param {{
 *   play: object,
 *   settling?: boolean,
 *   onOpen: () => void,
 * }} props
 */
function LedgerPlayCard({ play, settling = false, onOpen }) {
  const paid = Boolean(play.paid)
  const they = play.theyOweYou > 0
  const you = play.youOweThem > 0
  const amount = they ? play.theyOweYou : play.youOweThem
  const even = !they && !you
  return (
    <button
      type="button"
      onClick={() => {
        if (!settling) onOpen()
      }}
      disabled={settling}
      className={`w-full text-left rounded-2xl bg-zinc-900 border p-4 touch-manipulation cursor-pointer active:bg-zinc-800/90 disabled:opacity-60 ${
        paid ? 'border-zinc-800/40' : 'border-zinc-800/60'
      }`}
      data-play-logbook-card
      data-play-logbook-entry
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={`min-w-0 truncate font-bold ${paid ? 'text-zinc-300' : 'text-white'}`}>
              {play.gameLabel}
            </span>
            {paid ? (
              <span className="shrink-0 rounded-md bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                Paid
              </span>
            ) : null}
          </div>
          <div className="text-zinc-500 text-xs mt-0.5">{fmtLedgerCapturedAt(play.capturedAt)}</div>
          {play.casinoName ? (
            <div className="text-zinc-400 text-xs mt-0.5 truncate">{play.casinoName}</div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`text-sm font-bold tabular-nums ${
              paid
                ? 'text-zinc-400'
                : even
                  ? 'text-zinc-500'
                  : they
                    ? 'text-emerald-300'
                    : 'text-red-300'
            }`}
          >
            {even ? '$0' : formatPlayLogLedgerUsd(amount)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mt-0.5">
            {paid
              ? even
                ? 'Settled even'
                : they
                  ? 'Settled · they owed you'
                  : 'Settled · you owed them'
              : even
                ? 'Even'
                : they
                  ? 'They owe you'
                  : 'You owe them'}
          </div>
        </div>
      </div>
    </button>
  )
}

/**
 * @param {{
 *   rows: ReturnType<typeof playLogLedgerSettlementView>[],
 *   partnerRows?: object[],
 *   emptyHint?: string,
 *   className?: string,
 *   settling?: boolean,
 *   onAcceptSettlement?: (settlementId: string) => void | Promise<void>,
 *   onDeclineSettlement?: (settlementId: string) => void | Promise<void>,
 *   onOpenSettlement?: (row: ReturnType<typeof playLogLedgerSettlementView>) => void,
 * }} props
 */
function LedgerSettlementList({
  rows,
  partnerRows = [],
  emptyHint = '',
  className = '',
  settling = false,
  onAcceptSettlement,
  onDeclineSettlement,
  onOpenSettlement,
}) {
  return (
    <div className={className}>
      <LedgerSectionLabel>Ledger</LedgerSectionLabel>
      {rows.length ? (
        <div className="space-y-2">
          {rows.map(row => {
            const showAccept = settlementAcceptVisible(row, partnerRows)
            const canOpen =
              Boolean(onOpenSettlement) && (showAccept || Boolean(row.leftOpenByYou))
            return (
              <LedgerSettlementCard
                key={row.id}
                row={row}
                showActions={false}
                canOpen={canOpen}
                settling={settling}
                onOpen={() => onOpenSettlement?.(row)}
                onAccept={() => void onAcceptSettlement?.(row.id)}
                onDecline={() => void onDeclineSettlement?.(row.id)}
              />
            )
          })}
        </div>
      ) : emptyHint ? (
        <p className="text-zinc-500 text-xs px-1">{emptyHint}</p>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   row: ReturnType<typeof playLogLedgerSettlementView>,
 *   showActions?: boolean,
 *   showRemain?: boolean,
 *   canOpen?: boolean,
 *   settling?: boolean,
 *   onOpen?: () => void,
 *   onAccept?: () => void,
 *   onDecline?: () => void,
 * }} props
 */
function LedgerSettlementCard({
  row,
  showActions = false,
  showRemain = true,
  canOpen = false,
  settling = false,
  onOpen,
  onAccept,
  onDecline,
}) {
  const net = (row.theyOweYou || 0) - (row.youOweThem || 0)
  const plays = row.playCount === 1 ? '1 play' : `${row.playCount || 0} plays`
  const statusHint = row.leftOpenByYou
    ? 'You left this open'
    : row.leftOpenByThem
      ? 'They left this open'
      : showActions || canOpen
        ? 'Settled · update your books'
        : row.waitingOnThem
          ? 'Settled · waiting on them'
          : row.counterpartAcceptedAt
            ? 'Settled · both books updated'
            : 'Settled'
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{row.otherLabel}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{statusHint} · {plays}</div>
        </div>
        <span
          className={`shrink-0 text-sm font-bold tabular-nums ${
            net > 0 ? 'text-emerald-300' : net < 0 ? 'text-rose-400' : 'text-zinc-400'
          }`}
        >
          {formatLedgerSettledNet(net)}
        </span>
      </div>
      <div className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-zinc-400">They owed you</span>
          <span
            className={`font-bold tabular-nums ${
              row.theyOweYou > 0 ? 'text-emerald-300' : 'text-zinc-400'
            }`}
          >
            {formatPlayLogLedgerUsd(row.theyOweYou)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-zinc-400">You owed them</span>
          <span
            className={`font-bold tabular-nums ${
              row.youOweThem > 0 ? 'text-red-300' : 'text-zinc-400'
            }`}
          >
            {formatPlayLogLedgerUsd(row.youOweThem)}
          </span>
        </div>
      </div>
      {showActions ? (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              if (!settling) onAccept?.()
            }}
            disabled={settling}
            className="w-full min-h-11 rounded-2xl bg-cyan-600 text-white text-sm font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
          >
            {settling ? 'Updating…' : 'Update my books'}
          </button>
          {showRemain ? (
            <button
              type="button"
              data-play-logbook-ledger-remain
              onClick={e => {
                e.stopPropagation()
                if (!settling) onDecline?.()
              }}
              disabled={settling}
              className="w-full min-h-11 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-bold touch-manipulation active:bg-zinc-700 disabled:opacity-50"
            >
              Remain Unsettled
            </button>
          ) : null}
        </div>
      ) : row.waitingOnThem ? (
        <p className="mt-3 text-xs text-zinc-500 px-0.5">
          Waiting for them to update their books. We are not a bank… this only closed yours.
        </p>
      ) : row.leftOpenByThem ? (
        <p className="mt-3 text-xs text-zinc-500 px-0.5">
          They left this open on their books. Yours stay closed.
        </p>
      ) : row.leftOpenByYou ? (
        <p className="mt-3 text-xs text-zinc-500 px-0.5">
          You left this open. Tap to update your books later.
        </p>
      ) : canOpen ? (
        <p className="mt-3 text-xs text-zinc-500 px-0.5">Tap to update your books or remain unsettled.</p>
      ) : null}
      {row.createdAt ? (
        <div className="mt-1.5 text-[11px] text-zinc-500">{fmtLedgerCapturedAt(row.createdAt)}</div>
      ) : null}
    </>
  )

  const cardClass =
    'rounded-2xl border border-zinc-800/60 bg-zinc-900/60 px-4 py-3 text-left w-full'

  if (canOpen && !showActions) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!settling) onOpen?.()
        }}
        disabled={settling}
        className={`${cardClass} touch-manipulation cursor-pointer active:bg-zinc-800/90 disabled:opacity-60`}
        data-play-logbook-card
        data-play-logbook-ledger-settlement
      >
        {body}
      </button>
    )
  }

  return (
    <div className={cardClass} data-play-logbook-card data-play-logbook-ledger-settlement>
      {body}
    </div>
  )
}

/** Show accept only if those sessions are still open on the viewer’s books. */
function settlementAcceptVisible(row, partnerRows) {
  if (!row?.needsAccept) return false
  const partner = (partnerRows || []).find(p => p.key === row.counterpartKey)
  if (!partner) return true
  const openIds = new Set((partner.openPlays || []).map(play => String(play.sessionId)))
  const sessionIds = row.sessionIds || []
  if (!sessionIds.length) return true
  return sessionIds.some(sid => openIds.has(String(sid)))
}

/** Swap-settlement paren style: gain plain, loss in ( ). */
function formatLedgerSettledNet(net) {
  if (!net) return formatPlayLogLedgerUsd(0)
  if (net > 0) return formatPlayLogLedgerUsd(net)
  return `(${formatPlayLogLedgerUsd(-net)})`
}

/** @param {{ settling?: boolean, onClick: () => void }} props */
function LedgerSettleAllButton({ settling = false, onClick }) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        if (!settling) onClick()
      }}
      disabled={settling}
      className="mt-3 w-full min-h-11 rounded-2xl bg-cyan-600 text-white text-sm font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
    >
      {settling ? 'Settling…' : 'Settle All'}
    </button>
  )
}

/** @param {{ theyOweYou: number, youOweThem: number }} props */
function LedgerPairTotals({ theyOweYou, youOweThem }) {
  const net = theyOweYou - youOweThem
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-base">
        <span className="font-bold text-white">They owe you</span>
        <span
          className={`font-bold tabular-nums ${theyOweYou > 0 ? 'text-emerald-300' : 'text-zinc-400'}`}
        >
          {formatPlayLogLedgerUsd(theyOweYou)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-base">
        <span className="font-bold text-white">You owe them</span>
        <span
          className={`font-bold tabular-nums ${youOweThem > 0 ? 'text-red-300' : 'text-zinc-400'}`}
        >
          {formatPlayLogLedgerUsd(youOweThem)}
        </span>
      </div>
      {net !== 0 ? (
        <div className="flex items-baseline justify-between gap-3 text-xs pt-1">
          <span className="text-zinc-600">Net</span>
          <span
            className={`font-semibold tabular-nums ${
              net > 0 ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {net > 0
              ? `${formatPlayLogLedgerUsd(net)} to you`
              : `${formatPlayLogLedgerUsd(-net)} to them`}
          </span>
        </div>
      ) : (
        <div className="flex items-baseline justify-between gap-3 text-xs pt-1">
          <span className="text-zinc-600">Net</span>
          <span className="font-semibold tabular-nums text-zinc-400">Squared</span>
        </div>
      )}
    </div>
  )
}

/** @param {string | null} iso */
function fmtLedgerCapturedAt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
