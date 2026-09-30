import { useEffect, useMemo, useRef, useState } from 'react'
import { kalshiCents } from './gameHubFormatters.js'

const NFL_ABBR =
  'ATL|ARI|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LAC|LAR|LV|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SEA|SF|TB|TEN|WAS'

const PERIOD_META = [
  { id: 'fg', label: 'Full Game' },
  { id: '1h', label: '1st Half' },
  { id: '2h', label: '2nd Half' },
]

function propYes(prop) {
  if (!prop) return null
  const v = prop.yes_ask ?? prop.yes_bid ?? prop.last
  if (v == null || !Number.isFinite(Number(v))) return null
  return Math.max(0.01, Math.min(0.99, Number(v)))
}

function propNo(prop, yes) {
  if (!prop) return yes != null ? Math.max(0.01, Math.min(0.99, 1 - yes)) : null
  const v = prop.no_ask ?? prop.no_bid
  if (v != null && Number.isFinite(Number(v))) return Math.max(0.01, Math.min(0.99, Number(v)))
  return yes != null ? Math.max(0.01, Math.min(0.99, 1 - yes)) : null
}

function formatMult(prob) {
  if (prob == null || prob <= 0) return null
  return `${(1 / prob).toFixed(2)}x`
}

function formatPct(prob) {
  if (prob == null) return '-'
  return `${Math.round(prob * 100)}%`
}

function periodOf(prop) {
  const series = String(prop?.series || '').toLowerCase()
  const text = `${prop?.line_label || ''} ${prop?.title || ''}`.toLowerCase()
  if (series.includes('2h') || series.includes('second_half') || /\b2nd half\b|\bsecond half\b|\b2h\b/.test(text)) {
    return '2h'
  }
  if (series.includes('1h') || series.includes('first_half') || /\b1st half\b|\bfirst half\b|\b1h\b/.test(text)) {
    return '1h'
  }
  return 'fg'
}

function categoryOf(prop) {
  const series = String(prop?.series || '').toLowerCase()
  const text = `${prop?.line_label || ''} ${prop?.title || ''}`.toLowerCase()
  if (
    series.includes('teamtotal') ||
    series.includes('team_total') ||
    (series.includes('team') && series.includes('total')) ||
    series.includes('points_full_game') ||
    new RegExp(`\\b(?:${NFL_ABBR})\\s+over\\b`, 'i').test(text)
  ) {
    // Poly `football_team_full_game_total` is the game total ("Over 35.5 total points").
    return teamOf(prop) ? 'teamtotal' : 'total'
  }
  if (series.includes('spread') || (/\bspread\b/.test(series + text) && /[+-]?\d+(?:\.\d+)?/.test(text))) {
    return 'spread'
  }
  if (series.includes('total') || /\bover\b|\bunder\b|\btotal\b/.test(text)) return 'total'
  if (
    series.includes('winner') ||
    series.includes('kxnflgame') ||
    series.includes('kxncaafgame') ||
    /\bvs\b|\bwins?\b|\bmoneyline\b|\bml\b/.test(text) ||
    new RegExp(`^(?:${NFL_ABBR})(?:\\s+(?:1h|2h))?$`, 'i').test(String(prop?.line_label || '').trim())
  ) {
    return 'ml'
  }
  return 'other'
}

function strikeOf(prop) {
  // "wins 2H by over 6.5" … period tokens aren't the strike.
  const text = `${prop?.line_label || ''} ${prop?.title || ''}`.replace(
    /\b[1-4](?:st|nd|rd|th)?\s*(?:h|q|half|quarter)\b/gi,
    ' ',
  )
  const m = text.match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

function teamOf(prop) {
  // CFB props arrive pre-stamped with our ESPN abbrev (college names aren't in NFL_ABBR).
  const hint = String(prop?.team_hint || '').trim().toUpperCase()
  if (hint) return hint
  const text = `${prop?.line_label || ''} ${prop?.title || ''} ${prop?.team_hint || ''}`
  const m = text.match(new RegExp(`\\b(${NFL_ABBR})\\b`, 'i'))
  return m ? m[1].toUpperCase() : ''
}

function overUnderSide(prop) {
  const text = `${prop?.line_label || ''} ${prop?.title || ''}`.toLowerCase()
  if (/\bunder\b/.test(text)) return 'under'
  if (/\bover\b/.test(text)) return 'over'
  return 'yes'
}

function preferProp(a, b) {
  const pa = propYes(a)
  const pb = propYes(b)
  if (pa == null) return b || a
  if (pb == null) return a || b
  // Prefer Polymarket for the Poly-style % UI when both have a book.
  if (a?.source === 'polymarket' && b?.source !== 'polymarket') return a
  if (b?.source === 'polymarket' && a?.source !== 'polymarket') return b
  const liq = (p) => (p?.volume_24h ?? 0) + (p?.volume ?? 0) + (p?.open_interest ?? 0)
  return liq(b) > liq(a) ? b : a
}

function pickDefaultStrike(strikes) {
  if (!strikes.length) return null
  let best = strikes[0]
  let bestDist = Infinity
  for (const s of strikes) {
    const y = propYes(s.yesProp)
    if (y == null) continue
    const dist = Math.abs(y - 0.5)
    if (dist < bestDist) {
      bestDist = dist
      best = s
    }
  }
  return best.value
}

/**
 * Collapse Over/Under strike ladders into slider-friendly families.
 */
export function buildStrikeLadders(props, { awayAbbrev = '', homeAbbrev = '' } = {}) {
  const list = (Array.isArray(props) ? props : []).filter((p) => p && p.kind !== 'player')
  const ladders = new Map()

  const ensure = (key, meta) => {
    if (!ladders.has(key)) {
      ladders.set(key, {
        ...meta,
        id: key,
        byPeriod: {
          fg: new Map(),
          '1h': new Map(),
          '2h': new Map(),
        },
      })
    }
    return ladders.get(key)
  }

  for (const p of list) {
    const cat = categoryOf(p)
    if (cat === 'ml' || cat === 'other') continue
    const period = periodOf(p)
    const strike = strikeOf(p)
    if (strike == null) continue
    const team = teamOf(p)
    const side = overUnderSide(p)

    let key
    let title
    let sentence
    if (cat === 'total') {
      key = 'total'
      title = 'Total'
      sentence = (v) => `Over ${v} points`
    } else if (cat === 'spread') {
      const t = team || homeAbbrev || awayAbbrev || 'Team'
      key = `spread:${t}`
      title = 'Spread'
      sentence = (v) => `${t} to win by over ${v} points`
    } else if (cat === 'teamtotal') {
      const t = team || 'Team'
      key = `tt:${t}`
      title = `${t} total`
      sentence = (v) => `${t} Over ${v}`
    } else {
      continue
    }

    const ladder = ensure(key, { cat, title, sentence, team: team || null })
    const bucket = ladder.byPeriod[period]
    if (!bucket.has(strike)) {
      bucket.set(strike, { value: strike, over: null, under: null, yesAny: null })
    }
    const row = bucket.get(strike)
    if (side === 'under') row.under = preferProp(row.under, p)
    else if (side === 'over') row.over = preferProp(row.over, p)
    else row.yesAny = preferProp(row.yesAny, p)
  }

  const out = []
  for (const ladder of ladders.values()) {
    const periods = {}
    for (const meta of PERIOD_META) {
      const rows = [...(ladder.byPeriod[meta.id]?.values() || [])]
        .map((row) => {
          const yesProp = row.over || row.yesAny || null
          // Prefer the Over book's No side; fall back to a dedicated Under Yes.
          const noFromYes = yesProp
          const underAsNo = row.under
          return {
            value: row.value,
            yesProp,
            noProp: underAsNo || noFromYes,
            noIsUnderMarket: Boolean(underAsNo) && underAsNo !== yesProp,
          }
        })
        .filter((r) => propYes(r.yesProp) != null || propYes(r.noProp) != null)
        .sort((a, b) => a.value - b.value)
      if (rows.length) periods[meta.id] = rows
    }
    const periodIds = PERIOD_META.map((p) => p.id).filter((id) => periods[id]?.length)
    if (!periodIds.length) continue
    // Need a real ladder (2+ strikes) somewhere, else keep as simple rows elsewhere.
    const maxStrikes = Math.max(...periodIds.map((id) => periods[id].length))
    out.push({
      id: ladder.id,
      cat: ladder.cat,
      title: ladder.title,
      sentence: ladder.sentence,
      team: ladder.team,
      periods,
      periodIds,
      isLadder: maxStrikes >= 2,
    })
  }

  out.sort((a, b) => {
    const rank = (c) => (c === 'spread' ? 0 : c === 'total' ? 1 : 2)
    const d = rank(a.cat) - rank(b.cat)
    if (d !== 0) return d
    return String(a.title).localeCompare(String(b.title))
  })
  return out
}

function oddsPillClass(emphasize) {
  return emphasize
    ? 'border border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
    : 'border border-zinc-700 bg-zinc-800/80 text-zinc-200'
}

function PillLink({ href, className, children }) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} touch-manipulation active:opacity-85`}
      >
        {children}
      </a>
    )
  }
  return <div className={className}>{children}</div>
}

/** One outcome as a half-width pill: label left, % + payout right. */
function YesNoPill({ label, prob, href, emphasize }) {
  const mult = formatMult(prob)
  return (
    <PillLink
      href={href}
      className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 ${oddsPillClass(emphasize)}`}
    >
      <span className="text-[14px] font-semibold">{label}</span>
      <span className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-[15px] font-bold">{formatPct(prob)}</span>
        {mult ? <span className="text-[11px] font-medium opacity-70">{mult}</span> : null}
      </span>
    </PillLink>
  )
}

function StrikeSlider({ strikes, value, onChange }) {
  const scrollerRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    const node = activeRef.current
    const scroller = scrollerRef.current
    if (!node || !scroller) return
    const left = node.offsetLeft - scroller.clientWidth / 2 + node.clientWidth / 2
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [value, strikes])

  return (
    <div
      ref={scrollerRef}
      className="-mx-1 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-end gap-3 px-2">
        {strikes.map((s) => {
          const active = s.value === value
          return (
            <button
              key={s.value}
              ref={active ? activeRef : null}
              type="button"
              onClick={() => onChange(s.value)}
              className="flex w-9 flex-col items-center gap-1 touch-manipulation"
            >
              {active ? (
                <span className="text-[10px] leading-none text-emerald-400" aria-hidden>
                  ▼
                </span>
              ) : (
                <span className="h-2.5" aria-hidden />
              )}
              <span
                className={`text-[13px] font-semibold tabular-nums ${
                  active ? 'text-emerald-300' : 'text-zinc-500'
                }`}
              >
                {s.value}
              </span>
              <span className={`h-2 w-px ${active ? 'bg-emerald-400' : 'bg-zinc-700'}`} aria-hidden />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StrikeLadderCard({ ladder }) {
  const [period, setPeriod] = useState(() => ladder.periodIds[0] || 'fg')
  const strikes = ladder.periods[period] || []
  const [strike, setStrike] = useState(() => pickDefaultStrike(strikes))

  useEffect(() => {
    if (!ladder.periodIds.includes(period)) {
      setPeriod(ladder.periodIds[0] || 'fg')
    }
  }, [ladder.periodIds, period])

  useEffect(() => {
    const next = ladder.periods[period] || []
    if (!next.some((s) => s.value === strike)) {
      setStrike(pickDefaultStrike(next))
    }
  }, [ladder.periods, period, strike])

  const selected = strikes.find((s) => s.value === strike) || strikes[0] || null
  if (!selected) return null

  const yes = propYes(selected.yesProp)
  let no
  let noHref
  if (selected.noIsUnderMarket) {
    no = propYes(selected.noProp)
    noHref = selected.noProp?.url_yes || selected.noProp?.url_market || selected.noProp?.url
  } else {
    no = propNo(selected.noProp || selected.yesProp, yes)
    noHref = selected.yesProp?.url_no || selected.yesProp?.url_market || selected.yesProp?.url
  }
  const yesHref = selected.yesProp?.url_yes || selected.yesProp?.url_market || selected.yesProp?.url
  const sentence = ladder.sentence(selected.value)

  return (
    <div
      data-lounge-strike-ladder
      data-ladder={ladder.id}
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3"
    >
      <div className="text-[15px] font-semibold text-zinc-100">{ladder.title}</div>

      {ladder.periodIds.length > 1 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PERIOD_META.filter((p) => ladder.periodIds.includes(p.id)).map((p) => {
            const active = p.id === period
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold touch-manipulation ${
                  active
                    ? 'bg-zinc-100 text-zinc-950 ring-1 ring-inset ring-zinc-100'
                    : 'bg-zinc-800/80 text-zinc-400 ring-1 ring-inset ring-zinc-700/80'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="mt-3 text-[14px] font-medium leading-snug text-zinc-200">
        {String(sentence).split(String(selected.value)).map((part, i, arr) =>
          i < arr.length - 1 ? (
            <span key={i}>
              {part}
              <span className="mx-0.5 inline-flex items-center gap-0.5 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[13px] font-bold tabular-nums text-emerald-300">
                {selected.value}
                <span className="text-[9px] opacity-80" aria-hidden>
                  ▲
                </span>
              </span>
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </div>

      <StrikeSlider strikes={strikes} value={selected.value} onChange={setStrike} />

      <div className="mt-1 flex gap-2 border-t border-zinc-800/80 pt-3">
        <YesNoPill
          label="Yes"
          prob={yes}
          href={yesHref}
          emphasize={yes != null && (no == null || yes >= no)}
        />
        <YesNoPill
          label="No"
          prob={no}
          href={noHref}
          emphasize={no != null && yes != null && no > yes}
        />
      </div>

      {selected.yesProp?.source || selected.noProp?.source ? (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
          <span>
            {selected.yesProp?.source === 'polymarket'
              ? 'Poly'
              : selected.yesProp?.source === 'kalshi'
                ? 'Kalshi'
                : 'Market'}
            {yes != null ? ` · ${kalshiCents(yes)}` : ''}
          </span>
          <span>{strikes.length} lines</span>
        </div>
      ) : null}
    </div>
  )
}

function normalizeTeamText(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Which of the two game teams a label names: abbrev, then nickname, then city (when the cities differ). */
function matchGameTeam(text, teams) {
  const raw = String(text || '')
  const norm = ` ${normalizeTeamText(raw)} `
  for (const t of teams) {
    if (t.abbr && new RegExp(`\\b${t.abbr}\\b`, 'i').test(raw)) return t.abbr
  }
  for (const t of teams) {
    if (t.nickname && norm.includes(` ${t.nickname} `)) return t.abbr
  }
  const [a, b] = teams
  if (a?.city && b?.city && a.city !== b.city) {
    for (const t of teams) {
      if (t.city && norm.includes(` ${t.city} `)) return t.abbr
    }
  }
  return ''
}

function gameTeamMeta(side) {
  const abbr = String(side?.abbrev || '').trim().toUpperCase()
  const words = normalizeTeamText(side?.name).split(' ').filter(Boolean)
  return {
    abbr,
    nickname: words.length > 1 ? words[words.length - 1] : '',
    city: words.length > 1 ? words.slice(0, -1).join(' ') : words[0] || '',
  }
}

/** `{ yes, no }` team abbrevs a winner market pays on. "PIT vs CLE" books pay Yes on the first team, No on the second. */
function mlTeamsOf(prop, teams) {
  const label = String(prop?.line_label || '')
  const vs = label.match(/^\s*(.+?)\s+(?:vs\.?|v\.?|@|at)\s+(.+?)\s*$/i)
  if (vs) {
    const first = matchGameTeam(vs[1], teams)
    const second = matchGameTeam(vs[2], teams)
    if (first && second && first !== second) return { yes: first, no: second }
  }
  const hint = String(prop?.team_hint || '').trim().toUpperCase()
  if (hint && teams.some((t) => t.abbr === hint)) return { yes: hint, no: '' }
  const t = matchGameTeam(`${label} ${prop?.title || ''}`, teams)
  return t ? { yes: t, no: '' } : null
}

const ML_SOURCE_ORDER = ['polymarket', 'kalshi']

function sourceLabel(source) {
  if (source === 'polymarket') return 'Poly'
  if (source === 'kalshi') return 'Kalshi'
  return 'Market'
}

function TeamSide({ side, align }) {
  const abbr = String(side?.abbrev || '').toUpperCase() || (align === 'left' ? 'AWAY' : 'HOME')
  const logo = side?.logo ? (
    <img src={side.logo} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />
  ) : null
  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      {align === 'left' ? logo : null}
      <span className="truncate text-[15px] font-bold text-zinc-100">{abbr}</span>
      {align === 'right' ? logo : null}
    </div>
  )
}

function MoneylinePill({ entry, emphasize }) {
  const mult = formatMult(entry?.prob)
  return (
    <PillLink
      href={entry?.href}
      className={`flex min-w-[4.5rem] flex-col items-center rounded-xl px-2.5 py-1.5 tabular-nums ${oddsPillClass(emphasize)}`}
    >
      <span className="text-[15px] font-bold leading-tight">{formatPct(entry?.prob)}</span>
      <span className="text-[10px] font-medium leading-tight opacity-70">{mult || '-'}</span>
    </PillLink>
  )
}

/** Moneyline: away team left, home team right, both prices in the middle. */
export function MoneylineLadderCard({ props: propList, game }) {
  const board = useMemo(() => {
    const away = gameTeamMeta(game?.away)
    const home = gameTeamMeta(game?.home)
    if (!away.abbr || !home.abbr) return null
    const teams = [away, home]
    const bySource = new Map()
    const liq = (p) => (p?.volume_24h ?? 0) + (p?.volume ?? 0) + (p?.open_interest ?? 0)
    const put = (source, team, entry) => {
      if (!team || entry.prob == null) return
      if (!bySource.has(source)) bySource.set(source, new Map())
      const m = bySource.get(source)
      const prev = m.get(team)
      if (!prev || entry.liq > prev.liq) m.set(team, entry)
    }
    for (const p of propList || []) {
      if (categoryOf(p) !== 'ml' || periodOf(p) !== 'fg') continue
      const sides = mlTeamsOf(p, teams)
      if (!sides) continue
      const source = String(p.source || 'market')
      const yes = propYes(p)
      put(source, sides.yes, {
        prob: yes,
        href: p.url_yes || p.url_market || p.url,
        liq: liq(p),
        source,
      })
      if (sides.no) {
        put(source, sides.no, {
          prob: propNo(p, yes),
          href: p.url_no || p.url_market || p.url,
          liq: liq(p),
          source,
        })
      }
    }
    const sources = [
      ...ML_SOURCE_ORDER.filter((s) => bySource.has(s)),
      ...[...bySource.keys()].filter((s) => !ML_SOURCE_ORDER.includes(s)),
    ]
    const full = sources.find((s) => bySource.get(s).has(away.abbr) && bySource.get(s).has(home.abbr))
    if (full) {
      const m = bySource.get(full)
      return { away: m.get(away.abbr), home: m.get(home.abbr), source: full }
    }
    const pick = (abbr) => sources.map((s) => bySource.get(s).get(abbr)).find(Boolean) || null
    const a = pick(away.abbr)
    const h = pick(home.abbr)
    if (!a && !h) return null
    return { away: a, home: h, source: (a || h).source }
  }, [propList, game?.away, game?.home])

  if (!board) return null
  const awayProb = board.away?.prob ?? null
  const homeProb = board.home?.prob ?? null

  return (
    <div
      data-lounge-strike-ladder
      data-ladder="ml"
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3"
    >
      <div className="text-[15px] font-semibold text-zinc-100">Moneyline</div>
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)] items-center gap-2">
        <TeamSide side={game?.away} align="left" />
        <MoneylinePill
          entry={board.away}
          emphasize={awayProb != null && (homeProb == null || awayProb >= homeProb)}
        />
        <MoneylinePill
          entry={board.home}
          emphasize={homeProb != null && (awayProb == null || homeProb > awayProb)}
        />
        <TeamSide side={game?.home} align="right" />
      </div>
      <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
        {sourceLabel(board.source)}
      </div>
    </div>
  )
}

export function GameStrikeLaddersBoard({ props, game = null }) {
  const ladders = useMemo(
    () =>
      buildStrikeLadders(props, {
        awayAbbrev: game?.away?.abbrev,
        homeAbbrev: game?.home?.abbrev,
      }),
    [props, game?.away?.abbrev, game?.home?.abbrev],
  )
  const sliderLadders = ladders.filter((l) => l.isLadder)
  const singleStrike = ladders.filter((l) => !l.isLadder)

  return (
    <div className="space-y-3" data-lounge-strike-ladders>
      <MoneylineLadderCard props={props} game={game} />
      {sliderLadders.map((ladder) => (
        <StrikeLadderCard key={ladder.id} ladder={ladder} />
      ))}
      {singleStrike.map((ladder) => (
        <StrikeLadderCard key={ladder.id} ladder={ladder} />
      ))}
    </div>
  )
}
