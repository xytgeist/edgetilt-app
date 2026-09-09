import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  dueSplitsDrops,
  evaluateSplitsDrops,
  maybeFireSplitsDesktopNags,
  setSplitsNotifyEnabled,
  splitsNotifyEnabled,
  statusClass,
  statusLabel,
} from './syndicateSplitsDropSchedule.js'

/**
 * @param {{
 *   rows?: object[]
 *   compact?: boolean
 *   onOpenPaste?: () => void
 * }} props
 */
export function SyndicateSplitsDropSchedule({ rows = [], compact = false, onOpenPaste }) {
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [notifyOn, setNotifyOn] = useState(() => splitsNotifyEnabled())
  const [copiedId, setCopiedId] = useState('')

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const evaluated = useMemo(() => evaluateSplitsDrops(rows, new Date(nowTick)), [rows, nowTick])
  const due = useMemo(() => dueSplitsDrops(rows, new Date(nowTick)), [rows, nowTick])

  useEffect(() => {
    maybeFireSplitsDesktopNags(due, new Date(nowTick))
  }, [due, nowTick])

  const enableDesktop = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setSplitsNotifyEnabled(false)
      setNotifyOn(false)
      return
    }
    const perm = await Notification.requestPermission()
    const on = perm === 'granted'
    setSplitsNotifyEnabled(on)
    setNotifyOn(on)
    if (on) maybeFireSplitsDesktopNags(due, new Date())
  }, [due])

  const copySearch = useCallback(async (drop) => {
    try {
      await navigator.clipboard.writeText(drop.search)
      setCopiedId(drop.id)
      window.setTimeout(() => setCopiedId(''), 1500)
    } catch {
      setCopiedId('')
    }
  }, [])

  if (compact) {
    if (!due.length) return null
    return (
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2.5 space-y-1.5"
        data-syndicate-splits-drop-nag
      >
        <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-amber-300">
          Drop screenshots today
        </p>
        {due.map((d) => (
          <p key={d.id} className="text-[12px] text-amber-50 leading-snug">
            {d.shot}
          </p>
        ))}
        {onOpenPaste ? (
          <button
            type="button"
            onClick={onOpenPaste}
            className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-amber-400"
          >
            Open splits paste
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 space-y-2.5" data-syndicate-splits-drop-schedule>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-zinc-500">
            Screenshot schedule (PT)
          </p>
          <p className="text-[11px] text-zinc-400 leading-snug mt-0.5 max-w-xl">
            One habit. Same Action / VSiN shots land in one table. Chedda uses ticket vs handle for dogs.
            Tank uses those rows as a confirm, plus the totals tab for Overs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (notifyOn) {
              setSplitsNotifyEnabled(false)
              setNotifyOn(false)
              return
            }
            void enableDesktop()
          }}
          className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
            notifyOn
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {notifyOn ? 'Desktop alerts on' : 'Enable desktop alerts'}
        </button>
      </div>

      {due.length ? (
        <p className="rounded-md border border-amber-500/35 bg-amber-950/25 px-2 py-1.5 text-[12px] text-amber-100">
          Drop screenshots of {due.map((d) => d.label).join(' + ')} today.
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {evaluated.map((d) => (
          <li
            key={d.id}
            className={`rounded-md border px-2 py-1.5 ${
              d.status === 'due' ? 'border-amber-500/35 bg-amber-950/20' : 'border-zinc-800/80'
            }`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(d.status)}`}>
                {statusLabel(d.status)}
              </span>
              <span className="text-[12px] font-semibold text-zinc-200">{d.label}</span>
              <span className="text-[10px] text-zinc-500 uppercase">{d.sport}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-400 leading-snug">{d.shot}</p>
            <button
              type="button"
              onClick={() => void copySearch(d)}
              className="mt-1 text-[10px] text-sky-300 hover:text-sky-200"
            >
              {copiedId === d.id ? 'Copied search' : `Search: ${d.search}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
