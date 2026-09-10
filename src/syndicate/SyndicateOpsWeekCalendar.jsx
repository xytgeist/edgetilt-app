import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  dueSplitsDrops,
  maybeFireSplitsDesktopNags,
} from './syndicateSplitsDropSchedule.js'
import {
  buildOpsWeek,
  formatOpsWeekDayLabel,
  formatOpsWeekRange,
  isOpsWeekTaskMarked,
  OPS_WEEK_SPORTS,
  opsWeekCalendarOpen,
  opsWeekSportFilter,
  opsWeekStatusClass,
  opsWeekStatusLabel,
  setOpsWeekCalendarOpen,
  setOpsWeekSportFilter,
  setOpsWeekTaskMarked,
  sportChipClass,
  taskMatchesSportFilter,
} from './syndicateOpsWeekCalendar.js'

/**
 * @param {{
 *   rows?: object[]
 *   onOpenTab?: (tab: string) => void
 * }} props
 */
export function SyndicateOpsWeekCalendar({ rows = [], onOpenTab }) {
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [sport, setSport] = useState(() => opsWeekSportFilter())
  const [open, setOpen] = useState(() => opsWeekCalendarOpen())
  const [copiedId, setCopiedId] = useState('')
  const [markTick, setMarkTick] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const week = useMemo(
    () => buildOpsWeek(rows, new Date(nowTick)),
    [rows, nowTick, markTick],
  )
  const dueSplits = useMemo(() => dueSplitsDrops(rows, new Date(nowTick)), [rows, nowTick])

  useEffect(() => {
    maybeFireSplitsDesktopNags(dueSplits, new Date(nowTick))
  }, [dueSplits, nowTick])

  const setSportAndStore = useCallback((next) => {
    setSport(next)
    setOpsWeekSportFilter(next)
  }, [])

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      setOpsWeekCalendarOpen(next)
      return next
    })
  }, [])

  const copySearch = useCallback(async (task) => {
    if (!task.search) return
    try {
      await navigator.clipboard.writeText(task.search)
      setCopiedId(task.id)
      window.setTimeout(() => setCopiedId(''), 1500)
    } catch {
      setCopiedId('')
    }
  }, [])

  const toggleMark = useCallback((task, event) => {
    event.stopPropagation()
    if (!task.markable) return
    const next = !isOpsWeekTaskMarked(task.shopTue, task.id)
    setOpsWeekTaskMarked(task.shopTue, task.id, next)
    setMarkTick((n) => n + 1)
  }, [])

  const openTask = useCallback(
    (task) => {
      onOpenTab?.(task.tab)
    },
    [onOpenTab],
  )

  const owed = week.owed.filter((task) => taskMatchesSportFilter(task, sport))
  const dueNow = owed.filter((task) => task.status === 'due')
  const missedNow = owed.filter((task) => task.status === 'missed')

  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 space-y-2.5"
      data-ops-week-calendar
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={toggleOpen} className="text-left min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-zinc-500">
            Ops week (PT) {formatOpsWeekRange(week.mondayYmd, week.sundayYmd)}
          </p>
          <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
            {week.dueCount ? `${week.dueCount} due` : 'Nothing due'}
            {week.missedCount ? ` · ${week.missedCount} missed` : ''}
            {open ? '' : ' · tap to expand Mon-Sun'}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {OPS_WEEK_SPORTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSportAndStore(opt.id)}
              className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                sport === opt.id
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-100'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={toggleOpen}
            className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-semibold text-zinc-400 hover:text-zinc-200"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {dueNow.length || missedNow.length ? (
        <div className="rounded-md border border-amber-500/35 bg-amber-950/25 px-2 py-1.5 space-y-1.5">
          {dueNow.map((task) => (
            <button
              key={`${task.id}:${task.shopTue}`}
              type="button"
              onClick={() => openTask(task)}
              className="block w-full text-left text-[12px] text-amber-50 leading-snug hover:text-white"
            >
              <span className={`uppercase text-[10px] font-semibold ${sportChipClass(task.sports[0])}`}>
                {task.sports.join('/').toUpperCase()}
              </span>
              {' · Due · '}
              {task.label}
              {' ... '}
              {task.detail}
            </button>
          ))}
          {missedNow.length ? (
            <div className="flex flex-wrap gap-1">
              {missedNow.map((task) => (
                <button
                  key={`${task.id}:${task.shopTue}`}
                  type="button"
                  onClick={() => openTask(task)}
                  title={task.detail}
                  className="rounded border border-red-500/30 bg-red-950/30 px-1.5 py-0.5 text-[10px] text-red-200 hover:text-white"
                >
                  Missed {task.sports[0].toUpperCase()} {task.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="grid grid-cols-7 gap-1.5 min-w-[52rem]">
            {week.days.map((day) => {
              const tasks = day.tasks.filter((task) => taskMatchesSportFilter(task, sport))
              return (
                <div
                  key={day.ymd}
                  className={`rounded-md border px-1.5 py-1.5 min-h-[8.5rem] ${
                    day.isToday
                      ? 'border-amber-500/50 bg-amber-950/20'
                      : 'border-zinc-800/80 bg-zinc-950/40'
                  }`}
                >
                  <p className="text-[10px] font-semibold text-zinc-300">
                    {day.weekdayLabel} {formatOpsWeekDayLabel(day.ymd)}
                    {day.isToday ? (
                      <span className="ml-1 text-amber-300 uppercase tracking-wide">Today</span>
                    ) : null}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {tasks.length ? (
                      tasks.map((task) => (
                        <li key={`${task.id}:${day.ymd}`}>
                          <button
                            type="button"
                            onClick={() => openTask(task)}
                            title={task.detail}
                            className="w-full rounded border border-zinc-800/70 bg-zinc-900/70 px-1 py-1 text-left hover:border-zinc-600"
                          >
                            <div className="flex flex-wrap items-center gap-0.5">
                              <span
                                className={`inline-flex rounded border px-1 py-px text-[9px] font-semibold ${opsWeekStatusClass(task.status)}`}
                              >
                                {opsWeekStatusLabel(task.status)}
                              </span>
                              <span className={`text-[9px] font-semibold uppercase ${sportChipClass(task.sports[0])}`}>
                                {task.sports.length > 1 ? 'All' : task.sports[0]}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] font-medium text-zinc-200 leading-snug">
                              {task.label}
                            </p>
                          </button>
                          {task.search ? (
                            <button
                              type="button"
                              onClick={() => void copySearch(task)}
                              className="mt-0.5 block text-[9px] text-sky-300 hover:text-sky-200"
                            >
                              {copiedId === task.id ? 'Copied' : 'Copy search'}
                            </button>
                          ) : null}
                          {task.markable && task.status !== 'done' ? (
                            <button
                              type="button"
                              onClick={(event) => toggleMark(task, event)}
                              className="mt-0.5 block text-[9px] text-emerald-300/80 hover:text-emerald-200"
                            >
                              Mark in
                            </button>
                          ) : null}
                          {task.markable && task.status === 'done' && task.marked ? (
                            <button
                              type="button"
                              onClick={(event) => toggleMark(task, event)}
                              className="mt-0.5 block text-[9px] text-zinc-500 hover:text-zinc-300"
                            >
                              Undo mark
                            </button>
                          ) : null}
                        </li>
                      ))
                    ) : (
                      <li className="text-[10px] text-zinc-600">Quiet</li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
