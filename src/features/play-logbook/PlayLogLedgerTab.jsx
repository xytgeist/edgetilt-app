import { useEffect, useState } from 'react'
import {
  formatPlayLogLedgerUsd,
} from './playLogLedger.js'

/**
 * @param {{
 *   ledger: ReturnType<import('./playLogLedger.js').buildPlayLogLedger>,
 *   onOpenEntry: (entryId: string) => void,
 * }} props
 */
export default function PlayLogLedgerTab({ ledger, onOpenEntry }) {
  const [selectedKey, setSelectedKey] = useState(/** @type {string | null} */ (null))
  const counterparts = ledger?.counterparts || []
  const selected = counterparts.find(row => row.key === selectedKey) || null

  useEffect(() => {
    if (!selectedKey) return
    if (!counterparts.some(row => row.key === selectedKey)) setSelectedKey(null)
  }, [counterparts, selectedKey])

  if (selected) {
    return (
      <div data-play-logbook-ledger>
        <button
          type="button"
          onClick={() => setSelectedKey(null)}
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
        </div>
        <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide px-1 mb-1">
          Unpaid plays
        </div>
        <div className="space-y-2">
          {selected.plays.map(play => {
            const they = play.theyOweYou > 0
            const amount = they ? play.theyOweYou : play.youOweThem
            return (
              <button
                key={`${play.sessionId}:${play.entryId}`}
                type="button"
                onClick={() => onOpenEntry(play.entryId)}
                className="w-full text-left rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4 touch-manipulation cursor-pointer active:bg-zinc-800/90"
                data-play-logbook-card
                data-play-logbook-entry
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white font-bold truncate">{play.gameLabel}</div>
                    <div className="text-zinc-500 text-xs mt-0.5">
                      {fmtLedgerCapturedAt(play.capturedAt)}
                    </div>
                    {play.casinoName ? (
                      <div className="text-zinc-400 text-xs mt-0.5 truncate">{play.casinoName}</div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        they ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {formatPlayLogLedgerUsd(amount)}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mt-0.5">
                      {they ? 'They owe you' : 'You owe them'}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-zinc-500 text-xs mt-4 px-1">
          Tap a play to mark Paid. Settlement still goes through that play&apos;s manager.
        </p>
      </div>
    )
  }

  if (!counterparts.length) {
    return (
      <div
        className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-6 text-center"
        data-play-logbook-card
        data-play-logbook-ledger
      >
        {ledger?.hasSharedPlays && !ledger?.partnersLoaded ? (
          <>
            <div className="text-zinc-400 text-sm">Could not load partner balances.</div>
            <div className="text-zinc-500 text-xs mt-1">
              Open Logbook again in a moment. Shared plays are still on LOG.
            </div>
          </>
        ) : ledger?.hasSharedPlays ? (
          <>
            <div className="text-zinc-400 text-sm">All squared.</div>
            <div className="text-zinc-500 text-xs mt-1">
              Unpaid shared plays land here. Mark Paid on a play to drop it from the ledger.
            </div>
          </>
        ) : (
          <>
            <div className="text-zinc-400 text-sm">No open balances.</div>
            <div className="text-zinc-500 text-xs mt-1">
              Add a partner when you log a play. Unpaid shares show up here, combined across plays.
            </div>
          </>
        )}
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
        {counterparts.map(row => (
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
                  {row.plays.length === 1 ? '1 play' : `${row.plays.length} plays`}
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
    </div>
  )
}

/** @param {{ theyOweYou: number, youOweThem: number }} props */
function LedgerPairTotals({ theyOweYou, youOweThem }) {
  const net = theyOweYou - youOweThem
  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-zinc-500">They owe you</span>
        <span
          className={`font-bold tabular-nums ${theyOweYou > 0 ? 'text-emerald-300' : 'text-zinc-400'}`}
        >
          {formatPlayLogLedgerUsd(theyOweYou)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-zinc-500">You owe them</span>
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
      ) : null}
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
