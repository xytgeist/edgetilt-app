import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronDown } from 'lucide-react'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { loungeSportsGameDetail } from '../../utils/loungeSportsApi.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import {
  LOUNGE_FEED_TITLE_BAR_ROW_CLASS,
  LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS,
} from './loungeFeedAvatar.js'
import { usePhoneLandscapeNotTablet } from '../../utils/edgeiOSComposerPortraitLock.js'
import { stripTimeZoneSuffix } from './gameHub/gameHubFormatters.js'
import {
  formatGolfAmerican,
  formatGolfDateRange,
  formatGolfMoney,
  formatGolfToPar,
} from './loungeGolfFormat.js'
import LoungeGolferMark from './LoungeGolferMark.jsx'

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'odds', label: 'Odds' },
  { id: 'week', label: 'This week' },
]

function thruLabel(row, status) {
  if (status === 'pre' && row?.tee_time) {
    const t = Date.parse(row.tee_time)
    if (Number.isFinite(t)) {
      return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
  }
  if (row?.thru != null && Number(row.thru) > 0) return Number(row.thru) >= 18 ? 'F' : String(row.thru)
  if (status === 'post') return 'F'
  return '—'
}

function BoardRow({ row, status, open, onToggle }) {
  const rounds = Array.isArray(row.rounds) ? row.rounds : []
  return (
    <li data-lounge-golf-board-row={open ? 'open' : 'shut'}>
      <button type="button" onClick={onToggle} data-lounge-golf-board-main>
        <span data-lounge-golf-board-pos>{row.pos || '—'}</span>
        <LoungeGolferMark player={row} compact />
        <span data-lounge-golf-board-name>
          {row.short_name || row.name}
          {row.amateur ? <em> (a)</em> : null}
        </span>
        <span data-lounge-golf-board-score>{formatGolfToPar(row.score)}</span>
        <span data-lounge-golf-board-thru>{thruLabel(row, status)}</span>
        <ChevronDown data-lounge-golf-board-chev={open ? 'open' : 'shut'} className="h-4 w-4 transition-transform" />
      </button>
      {open ? (
        <div data-lounge-golf-board-more>
          <div data-lounge-golf-rounds>
            {rounds.length ? rounds.map((round) => (
              <span key={round.period}>
                <b>R{round.period}</b>
                {round.strokes != null ? ` ${round.strokes}` : ' —'}
                {round.to_par != null ? ` (${formatGolfToPar(round.to_par)})` : ''}
              </span>
            )) : <span>Round scores pending.</span>}
          </div>
          {row.earnings ? <div data-lounge-golf-earn>{formatGolfMoney(row.earnings)}</div> : null}
        </div>
      ) : null}
    </li>
  )
}

export default function LoungeGolfTournamentHub({ supabaseClient, embedded = false }) {
  const sports = useLoungeSportsFeed()
  const game = sports?.hubGame
  const phoneLandscape = usePhoneLandscapeNotTablet()
  const [tab, setTab] = useState('board')
  const [field, setField] = useState([])
  const [holes, setHoles] = useState([])
  const [golfOdds, setGolfOdds] = useState([])
  const [openId, setOpenId] = useState('')

  useEffect(() => {
    if (!game?.id || !supabaseClient) return undefined
    let alive = true
    const load = () => {
      void loungeSportsGameDetail(supabaseClient, game.id, { omitRosters: true }).then((data) => {
        if (!alive || data?.error) return
        const nextGolf = data.game?.golf || data.golf
        if (Array.isArray(nextGolf?.field)) setField(nextGolf.field)
        if (Array.isArray(nextGolf?.course_holes)) setHoles(nextGolf.course_holes)
        if (Array.isArray(data.golf_odds)) setGolfOdds(data.golf_odds)
      }, () => {})
    }
    load()
    const ms = game.status === 'in' ? 15_000 : 120_000
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      load()
    }, ms)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [game?.id, game?.status, supabaseClient])

  const golf = game?.golf && typeof game.golf === 'object' ? game.golf : {}
  const rows = field.length ? field : (Array.isArray(golf.leaders) ? golf.leaders : [])
  const title = String(golf.tournament || game?.home?.name || 'Golf').trim()
  const bestOdds = useMemo(() => {
    const byName = new Map()
    for (const row of golfOdds) {
      const name = String(row.name || '').trim()
      if (!name) continue
      const cur = byName.get(name)
      if (!cur || Number(row.price) > Number(cur.price)) byName.set(name, row)
    }
    return [...byName.values()].sort((a, b) => Number(a.price) - Number(b.price))
  }, [golfOdds])

  if (!game) return null

  const root = (
    <div
      data-lounge-golf-hub
      className={embedded ? 'flex h-full min-h-0 flex-col bg-zinc-950 text-white' : 'fixed inset-0 flex flex-col bg-zinc-950 text-white'}
      style={
        embedded
          ? undefined
          : {
              zIndex: Z_APP_MODAL,
              ...(phoneLandscape
                ? { paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }
                : null),
            }
      }
    >
      <div
        {...(embedded ? { 'data-lounge-align-feed-title': '' } : {})}
        className={
          embedded
            ? `flex items-center gap-2 ${LOUNGE_FEED_TITLE_BAR_ROW_CLASS}`
            : 'flex items-center gap-2 px-2 pt-[max(0.5rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] pb-1'
        }
      >
        <button
          type="button"
          onClick={() => sports.closeHub?.()}
          className={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-zinc-800`}
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold tracking-tight">{title}</div>
          <div className="truncate text-[12px] text-zinc-500">
            {[
              golf.tour_label,
              formatGolfDateRange(golf.start_date || game.commence_time, golf.end_date),
              golf.venue,
              stripTimeZoneSuffix(game.status_label),
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div data-lounge-golf-hub-tabs>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-lounge-golf-hub-tab={tab === item.id ? 'on' : 'off'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
        {tab === 'board' ? (
          <ol data-lounge-golf-board>
            {rows.map((row, i) => (
              <BoardRow
                key={row.player_id || `${row.name}-${i}`}
                row={row}
                status={game.status}
                open={openId === (row.player_id || row.name)}
                onToggle={() => {
                  const id = row.player_id || row.name
                  setOpenId((cur) => (cur === id ? '' : id))
                }}
              />
            ))}
            {!rows.length ? <li data-lounge-golf-empty>Field loads when the board is ready.</li> : null}
          </ol>
        ) : null}

        {tab === 'odds' ? (
          <ol data-lounge-golf-odds>
            {bestOdds.map((row) => (
              <li key={`${row.book}-${row.name}`}>
                <span>{row.name}</span>
                <span>{formatGolfAmerican(row.price)}</span>
              </li>
            ))}
            {!bestOdds.length ? (
              <li data-lounge-golf-empty>No tournament winner prices on the shop yet. Player props land as books post them.</li>
            ) : null}
          </ol>
        ) : null}

        {tab === 'week' ? (
          <div data-lounge-golf-week>
            <div data-lounge-golf-week-head>
              {[golf.par != null ? `Par ${golf.par}` : '', golf.yards != null ? `${Number(golf.yards).toLocaleString()} yards` : '', golf.purse_label || formatGolfMoney(golf.purse)]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {holes.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Hole</th>
                    <th>Par</th>
                    <th>Yards</th>
                  </tr>
                </thead>
                <tbody>
                  {holes.map((hole) => (
                    <tr key={hole.number}>
                      <td>{hole.number}</td>
                      <td>{hole.par}</td>
                      <td>{hole.yards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p data-lounge-golf-empty>Course card loads with the full board.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )

  if (embedded) return root
  if (typeof document === 'undefined') return null
  return createPortal(root, document.body)
}
