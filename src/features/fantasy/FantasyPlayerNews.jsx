import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useHeadshotSrc } from '../../utils/playerHeadshot.js'
import { lineupNews, newsTimeAgo } from './fantasyNewsStatus.js'

const NOTES_COLLAPSED = 8

const BREAKING_MS = 2 * 60 * 60 * 1000

function isBreaking(note) {
  const posted = Date.parse(note?.published || '')
  return note?.kind === 'insider' && Number.isFinite(posted) && Date.now() - posted < BREAKING_MS
}

/** League tones (index into the league list), so each league reads in its own color; colors live in index.css. */
const LEAGUE_TONES = 6

function LeagueTags({ leagues, leagueOrder }) {
  return (
    <div data-fantasy-news-leagues className="truncate text-[10px] font-semibold">
      {leagues.map((name, i) => {
        const at = leagueOrder.indexOf(name)
        return (
          <span key={name}>
            {i ? <span className="text-zinc-500"> · </span> : null}
            <span data-league-tone={(at >= 0 ? at : i) % LEAGUE_TONES}>{name}</span>
          </span>
        )
      })}
    </div>
  )
}

/** NFL notes come back untagged; NBA notes carry `sport: 'nba'`. */
const noteSport = (note) => String(note?.sport || 'nfl').toLowerCase()
const SPORT_LABEL = { nfl: 'NFL', nba: 'NBA' }

function NoteRow({ note, leagues, leagueOrder, bench }) {
  const [open, setOpen] = useState(false)
  const shot = useHeadshotSrc(note.headshot_url, 96)
  const insider = note.kind === 'insider'
  const breaking = isBreaking(note)
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left touch-manipulation"
        aria-expanded={open}
      >
        {shot.failed || !note.headshot_url ? (
          <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-zinc-800" aria-hidden />
        ) : (note.sport || 'nfl') === 'nfl' ? (
          // NFL headshots are wide shoulder-up shots; zoom to the face like the waiver list does.
          <span className="relative mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-800">
            <img
              src={shot.src}
              alt=""
              onError={shot.onError}
              className="absolute inset-0 h-full w-full origin-[center_30%] scale-[1.75] object-cover"
              loading="lazy"
            />
          </span>
        ) : (
          <img
            src={shot.src}
            alt=""
            onError={shot.onError}
            className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-zinc-800 object-cover object-top"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-bold text-white">{note.player}</span>
            <span data-fantasy-news-sport={noteSport(note)} className="shrink-0 rounded px-1 text-[9px] font-bold">
              {SPORT_LABEL[noteSport(note)] || noteSport(note).toUpperCase()}
            </span>
            <span className="shrink-0 text-[11px] font-medium text-zinc-500">
              {[note.position, note.team].filter(Boolean).join(' · ')}
            </span>
            {bench ? <span className="shrink-0 text-[10px] font-semibold uppercase text-zinc-500">Bench</span> : null}
            {breaking ? (
              <span data-fantasy-news-breaking className="shrink-0 rounded px-1 text-[9px] font-bold uppercase">
                Breaking
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-[11px] text-zinc-500">{newsTimeAgo(note.published)}</span>
          </div>
          {leagues?.length ? <LeagueTags leagues={leagues} leagueOrder={leagueOrder} /> : null}
          <div className={`mt-0.5 text-[13px] leading-snug ${insider ? 'font-semibold text-zinc-100' : 'text-zinc-300'} ${open ? '' : 'line-clamp-2'}`}>
            {note.headline}
          </div>
          {open && note.story ? <div className="mt-1.5 text-[12px] leading-snug text-zinc-400">{note.story}</div> : null}
          {open && note.impact ? (
            <div className="mt-1.5 text-[12px] leading-snug text-zinc-300">
              <span className="font-bold text-zinc-100">Fantasy impact: </span>
              {note.impact}
            </div>
          ) : null}
        </div>
      </button>
      {open && note.url ? (
        <a
          href={note.url}
          target="_blank"
          rel="noopener noreferrer"
          className="-mt-1 mb-2 ml-[3.375rem] inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500"
        >
          {note.source} <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </li>
  )
}

/**
 * Main Fantasy page: insider and Rotowire notes for every NFL player on your rosters, newest first.
 * `players` maps sleeper id → { leagues: string[], starting: boolean }; `news` comes from `usePlayerNews`.
 */
export default function FantasyPlayerNews({ players, news, showLeagues, leagueOrder = [] }) {
  const [all, setAll] = useState(false)
  // Lineup news (injury / availability / role / moves) by default; stat recaps one tap away under All.
  const [filter, setFilter] = useState('lineup')
  const [sport, setSport] = useState('all')
  if (!news?.key) return null
  const { loading } = news
  const state = news
  // Sport chips only when the feed mixes sports; a picked sport that drops out falls back to all.
  const sports = [...new Set((news.notes || []).map(noteSport))].sort()
  const sportPick = sports.length > 1 && sports.includes(sport) ? sport : 'all'
  const bySport = sportPick === 'all' ? news.notes : news.notes.filter((n) => noteSport(n) === sportPick)
  const notes = filter === 'lineup' ? bySport.filter(lineupNews) : bySport
  const shown = all ? notes : notes.slice(0, NOTES_COLLAPSED)

  return (
    <section data-fantasy-news className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Player news</div>
        <div data-fantasy-news-filter className="flex rounded-full border border-zinc-800 p-0.5" role="radiogroup" aria-label="News filter">
          {[
            ['lineup', 'Lineup'],
            ['all', 'All'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold touch-manipulation ${filter === id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="-mt-0.5 flex items-center justify-between gap-2 px-3 pb-1">
        <span className="truncate text-[10px] text-zinc-500">Insiders on X · Rotowire</span>
        {sports.length > 1 ? (
          <div data-fantasy-news-sport-filter className="flex shrink-0 gap-1" role="radiogroup" aria-label="Sport">
            {['all', ...sports].map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={sportPick === id}
                onClick={() => setSport(id)}
                className={`rounded-full border px-2 py-px text-[10px] font-semibold touch-manipulation ${
                  sportPick === id ? 'border-zinc-100 bg-zinc-100 text-zinc-950' : 'border-zinc-800 text-zinc-400'
                }`}
              >
                {id === 'all' ? 'All' : SPORT_LABEL[id] || id.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {loading ? (
        <div className="px-3 pb-3 text-[12px] text-zinc-500">Loading news…</div>
      ) : !notes.length ? (
        <div className="px-3 pb-3 text-[12px] text-zinc-500">
          {state.error ||
            (filter === 'lineup'
              ? `No lineup news on your ${sportPick === 'all' ? '' : `${SPORT_LABEL[sportPick] || sportPick.toUpperCase()} `}players right now.`
              : 'No news on your players in the last 10 days.')}
        </div>
      ) : (
        <>
          <ul data-fantasy-news-list className="divide-y divide-zinc-800">
            {shown.map((note) => {
              const p = players.get(note.sleeper_id)
              return (
                <NoteRow
                  key={`${note.sleeper_id}:${note.id}`}
                  note={note}
                  leagues={showLeagues && p?.leagues?.length ? p.leagues : null}
                  leagueOrder={leagueOrder}
                  bench={p ? !p.starting : false}
                />
              )
            })}
          </ul>
          {notes.length > NOTES_COLLAPSED ? (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="w-full border-t border-zinc-800 py-2 text-[12px] font-semibold text-zinc-400 touch-manipulation"
            >
              {all ? 'Show less' : `Show all ${notes.length} notes`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
