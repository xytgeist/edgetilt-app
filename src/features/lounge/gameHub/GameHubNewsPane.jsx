import { useState } from 'react'
import { ExternalLink, PlayCircle } from 'lucide-react'

const NOTES_COLLAPSED = 8
const INJURIES_COLLAPSED = 6

function timeAgo(iso) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function statusTone(inj) {
  const s = String(inj.status_abbrev || inj.status || '').toUpperCase()
  if (s.startsWith('O') || s.includes('IR') || s.includes('RESERVE') || s.includes('PUP')) return 'out'
  if (s.startsWith('D')) return 'doubtful'
  if (s.startsWith('Q')) return 'questionable'
  return 'other'
}

function statusShort(inj) {
  const abbrev = String(inj.status_abbrev || '').trim()
  if (abbrev) return abbrev.toUpperCase()
  return String(inj.status || '').slice(0, 3).toUpperCase()
}

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-baseline justify-between px-3 pb-1.5 pt-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{children}</div>
      {right ? <div className="text-[10px] text-zinc-500">{right}</div> : null}
    </div>
  )
}

function ArticleCard({ article }) {
  const recap = /recap/i.test(article.kind)
  return (
    <a
      href={article.url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      data-game-news-article
      className="block overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 touch-manipulation active:opacity-90"
    >
      {article.image ? (
        <img src={article.image} alt="" className="h-36 w-full object-cover" loading="lazy" />
      ) : null}
      <div className="px-3 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {recap ? 'Recap' : 'Preview'} · ESPN
        </div>
        <div className="mt-0.5 text-[15px] font-bold leading-snug text-white">{article.headline}</div>
        {article.description ? (
          <div className="mt-1 text-[13px] leading-snug text-zinc-400">{article.description}</div>
        ) : null}
      </div>
    </a>
  )
}

function InjuryTeam({ side, rows }) {
  const [open, setOpen] = useState(false)
  if (!rows.length) {
    return (
      <div className="px-3 py-2">
        <div className="text-[12px] font-bold text-zinc-300">{side?.abbrev || ''}</div>
        <div className="text-[12px] text-zinc-500">No injuries listed.</div>
      </div>
    )
  }
  const shown = open ? rows : rows.slice(0, INJURIES_COLLAPSED)
  return (
    <div className="px-3 py-2">
      <div className="pb-1 text-[12px] font-bold text-zinc-300">{side?.abbrev || ''}</div>
      <ul className="space-y-1.5">
        {shown.map((inj) => (
          <li key={inj.id} className="flex items-start gap-2">
            <span
              data-game-news-injury={statusTone(inj)}
              className="mt-px w-7 shrink-0 rounded px-1 py-px text-center text-[10px] font-bold"
            >
              {statusShort(inj)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white">
                {inj.name}
                {inj.position ? <span className="ml-1 text-[11px] font-medium text-zinc-500">{inj.position}</span> : null}
              </div>
              {inj.detail ? <div className="truncate text-[11px] text-zinc-500">{inj.detail}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > INJURIES_COLLAPSED ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 text-[12px] font-semibold text-zinc-400 touch-manipulation"
        >
          {open ? 'Show less' : `+${rows.length - INJURIES_COLLAPSED} more`}
        </button>
      ) : null}
    </div>
  )
}

function PlayerNote({ note, game }) {
  const [open, setOpen] = useState(false)
  const side = note.side === 'home' ? game.home : game.away
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full px-3 py-2.5 text-left touch-manipulation"
        aria-expanded={open}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-bold text-white">{note.player}</span>
          <span className="shrink-0 text-[11px] font-medium text-zinc-500">
            {[note.position, side?.abbrev].filter(Boolean).join(' · ')}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-zinc-500">{timeAgo(note.published)}</span>
        </div>
        <div className={`mt-0.5 text-[13px] leading-snug text-zinc-300 ${open ? '' : 'line-clamp-2'}`}>
          {note.headline}
        </div>
        {open && note.story ? (
          <div className="mt-1.5 text-[12px] leading-snug text-zinc-400">{note.story}</div>
        ) : null}
      </button>
      {open && note.url ? (
        <a
          href={note.url}
          target="_blank"
          rel="noopener noreferrer"
          className="-mt-1 mb-2 ml-3 inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500"
        >
          {note.source} <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </li>
  )
}

function StoryRow({ story }) {
  const video = /media|video/i.test(story.kind)
  return (
    <li>
      <a
        href={story.url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-3 px-3 py-2.5 touch-manipulation active:opacity-90"
      >
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{story.headline}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
            {video ? <PlayCircle className="h-3 w-3" /> : null}
            <span>{video ? 'Video' : 'ESPN'}</span>
            {story.published ? <span>· {timeAgo(story.published)}</span> : null}
          </div>
        </div>
        {story.image ? (
          <img src={story.image} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
        ) : null}
      </a>
    </li>
  )
}

/**
 * Game hub News tab: ESPN preview/recap, injury report (NFL), Rotowire player notes, matchup stories.
 * @param {{ news: object | null, loading: boolean, error: string, game: object }} props
 */
export default function GameHubNewsPane({ news, loading, error, game }) {
  const [allNotes, setAllNotes] = useState(false)
  if (loading && !news) return <div className="py-8 text-center text-sm text-zinc-500">Loading news…</div>
  if (error && !news) return <div className="py-8 text-center text-sm text-lv-red">{error}</div>
  if (!news) return <div className="py-8 text-center text-sm text-zinc-500">No news for this game yet.</div>

  const injuries = news.injuries
  const notes = Array.isArray(news.player_notes) ? news.player_notes : []
  const stories = Array.isArray(news.stories) ? news.stories : []
  const shownNotes = allNotes ? notes : notes.slice(0, NOTES_COLLAPSED)
  const hasInjuries = Boolean(injuries && (injuries.away?.length || injuries.home?.length))
  const empty = !news.article && !hasInjuries && !notes.length && !stories.length
  const rotowireViaEspn = notes.some((n) => /via ESPN/i.test(n.source))

  if (empty) return <div className="py-8 text-center text-sm text-zinc-500">No news for this game yet.</div>

  return (
    <div data-game-news className="space-y-3 py-3">
      {news.article ? <ArticleCard article={news.article} /> : null}

      {injuries ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <SectionTitle>Injury report</SectionTitle>
          <div data-game-news-injury-cols className="grid grid-cols-2 divide-x divide-zinc-800 pb-1">
            <InjuryTeam side={game.away} rows={injuries.away || []} />
            <InjuryTeam side={game.home} rows={injuries.home || []} />
          </div>
        </div>
      ) : null}

      {notes.length ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <SectionTitle right={rotowireViaEspn ? 'Rotowire via ESPN' : 'Rotowire'}>Player notes</SectionTitle>
          <ul data-game-news-list className="divide-y divide-zinc-800">
            {shownNotes.map((note) => (
              <PlayerNote key={note.id} note={note} game={game} />
            ))}
          </ul>
          {notes.length > NOTES_COLLAPSED ? (
            <button
              type="button"
              onClick={() => setAllNotes((v) => !v)}
              className="w-full border-t border-zinc-800 py-2 text-[12px] font-semibold text-zinc-400 touch-manipulation"
            >
              {allNotes ? 'Show less' : `Show all ${notes.length} notes`}
            </button>
          ) : null}
        </div>
      ) : null}

      {stories.length ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <SectionTitle>Team stories</SectionTitle>
          <ul data-game-news-list className="divide-y divide-zinc-800">
            {stories.map((story) => (
              <StoryRow key={story.id} story={story} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
