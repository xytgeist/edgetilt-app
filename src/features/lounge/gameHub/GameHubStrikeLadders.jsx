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
    return 'teamtotal'
  }
  if (series.includes('spread') || (/\bspread\b/.test(series + text) && /[+-]?\d+(?:\.\d+)?/.test(text))) {
    return 'spread'
  }
  if (series.includes('total') || /\bover\b|\bunder\b|\btotal\b/.test(text)) return 'total'
  if (
    series.includes('winner') ||
    series.includes('kxnflgame') ||
    /\bvs\b|\bwins?\b|\bmoneyline\b|\bml\b/.test(text) ||
    new RegExp(`^(?:${NFL_ABBR})(?:\\s+(?:1h|2h))?$`, 'i').test(String(prop?.line_label || '').trim())
  ) {
    return 'ml'
  }
  return 'other'
}

function strikeOf(prop) {
  const text = `${prop?.line_label || ''} ${prop?.title || ''}`
  const m = text.match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

function teamOf(prop) {
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

function YesNoOutcomeRow({ label, prob, mult, href, emphasize }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-zinc-100">{label}</div>
        <div className="mt-1 h-px w-full bg-zinc-800" />
      </div>
      <span className="shrink-0 text-[13px] font-medium tabular-nums text-zinc-400">{mult || '-'}</span>
      <span
        className={`inline-flex min-w-[4.25rem] shrink-0 items-center justify-center rounded-full px-3 py-2 text-[14px] font-bold tabular-nums ${
          emphasize
            ? 'border border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
            : 'border border-zinc-700 bg-zinc-800/80 text-zinc-200'
        }`}
      >
        {formatPct(prob)}
      </span>
    </>
  )
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 touch-manipulation active:opacity-85"
      >
        {inner}
      </a>
    )
  }
  return <div className="flex items-center gap-3">{inner}</div>
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

      <div className="mt-1 space-y-3 border-t border-zinc-800/80 pt-3">
        <YesNoOutcomeRow
          label="Yes"
          prob={yes}
          mult={formatMult(yes)}
          href={yesHref}
          emphasize={yes != null && (no == null || yes >= no)}
        />
        <YesNoOutcomeRow
          label="No"
          prob={no}
          mult={formatMult(no)}
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

/** Moneyline stays a short two-team board (no strike ladder). */
export function MoneylineLadderCard({ props: propList, awayAbbrev, homeAbbrev }) {
  const sides = useMemo(() => {
    const mls = (propList || []).filter((p) => categoryOf(p) === 'ml' && periodOf(p) === 'fg')
    const byTeam = new Map()
    for (const p of mls) {
      const t = teamOf(p)
      if (!t) continue
      byTeam.set(t, preferProp(byTeam.get(t), p))
    }
    const away = byTeam.get(String(awayAbbrev || '').toUpperCase()) || null
    const home = byTeam.get(String(homeAbbrev || '').toUpperCase()) || null
    return { away, home }
  }, [propList, awayAbbrev, homeAbbrev])

  if (!sides.away && !sides.home) return null

  const row = (label, prop) => {
    const yes = propYes(prop)
    if (yes == null) return null
    const href = prop?.url_yes || prop?.url_market || prop?.url
    return (
      <YesNoOutcomeRow
        key={label}
        label={label}
        prob={yes}
        mult={formatMult(yes)}
        href={href}
        emphasize={yes >= 0.5}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3">
      <div className="text-[15px] font-semibold text-zinc-100">Moneyline</div>
      <div className="mt-3 space-y-3">
        {row(String(awayAbbrev || 'Away').toUpperCase(), sides.away)}
        {row(String(homeAbbrev || 'Home').toUpperCase(), sides.home)}
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
      <MoneylineLadderCard
        props={props}
        awayAbbrev={game?.away?.abbrev}
        homeAbbrev={game?.home?.abbrev}
      />
      {sliderLadders.map((ladder) => (
        <StrikeLadderCard key={ladder.id} ladder={ladder} />
      ))}
      {singleStrike.map((ladder) => (
        <StrikeLadderCard key={ladder.id} ladder={ladder} />
      ))}
    </div>
  )
}
