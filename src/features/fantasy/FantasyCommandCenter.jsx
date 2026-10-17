import { useMemo, useRef, useState } from 'react'

const TOOLS = [
  {
    id: 'start',
    label: 'Start/Sit',
    body: 'The synced starters are what the host has in the lineup. A suggested swap needs the value engine, which is not computing yet.',
  },
  {
    id: 'waiver',
    label: 'Waivers',
    body: 'Waiver rank is this league’s free agents, not a global top 50. That pool is not synced yet.',
  },
  {
    id: 'trade',
    label: 'Trades',
    body: 'Trade finder and offer review need every roster’s need and surplus. Not computing yet.',
  },
  {
    id: 'live',
    label: 'Live',
    body: 'Live week scores for your starters sit on the NFL game hubs. A fantasy week board is next.',
  },
  {
    id: 'fliers',
    label: 'Fliers',
    body: 'A flier is a small bet that pays when a starter busts or an opponent goes off. Nothing is suggested until that hedge exists.',
  },
]

function providerLabel(provider) {
  if (provider === 'yahoo') return 'Yahoo'
  if (provider === 'sleeper') return 'Sleeper'
  if (provider === 'espn') return 'ESPN'
  if (provider === 'cbs') return 'CBS'
  return provider || ''
}

function recordLine(t) {
  if (!t) return ''
  const w = Number(t.wins) || 0
  const l = Number(t.losses) || 0
  const ti = Number(t.ties) || 0
  return ti > 0 ? `${w}-${l}-${ti}` : `${w}-${l}`
}

function TeamLogo({ team }) {
  const [failed, setFailed] = useState(false)
  const url = String(team?.avatar_url || '').trim()
  const letter = String(team?.team_name || '?').trim().slice(0, 1).toUpperCase() || '?'
  if (!url || failed) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[13px] font-bold"
        style={{ color: '#fff' }}
      >
        {letter}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full bg-zinc-800 object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function injuryLabel(status) {
  const s = String(status || '').trim()
  if (!s) return ''
  if (/^q(uestionable)?$/i.test(s)) return 'Q'
  if (/^d(oubtful)?$/i.test(s)) return 'D'
  if (/^out$/i.test(s)) return 'Out'
  if (/^ir$/i.test(s)) return 'IR'
  return s.length > 12 ? s.slice(0, 12) : s
}

function startersOf(rows) {
  return (rows || []).filter((r) => r.slot === 'starter')
}

function fantasyPos(position) {
  const p = String(position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p === 'FB' || p === 'HB') return 'RB'
  if (p === 'DST' || p === 'D' || p === 'DEF') return 'DEF'
  if (p === 'PK') return 'K'
  return p
}

function shortName(name, position) {
  if (fantasyPos(position) === 'DEF') return String(name || 'DEF').toUpperCase()
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0].toUpperCase()
  return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(' ').toUpperCase()}`
}

function slotPill(row, index) {
  const raw = String(row?.slot_label || '')
  const named = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw
  if (named && !/^\d+$/.test(named)) return named
  return fantasyPos(row?.position) || `${index + 1}`
}

function pairBySlot(left, right) {
  const n = Math.max(left.length, right.length)
  const pairs = []
  for (let i = 0; i < n; i += 1) {
    const label = slotPill(left[i] || right[i], i)
    pairs.push({
      key: `${label}-${i}`,
      label,
      left: left[i] || null,
      right: right[i] || null,
    })
  }
  return pairs
}

function benchOf(rows) {
  return (rows || []).filter((r) => r.slot !== 'starter')
}

function pairLineup(leftRows, rightRows) {
  const left = leftRows || []
  const right = rightRows || []
  const nfl = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
  const sample = left.concat(right)
  if (sample.length && !sample.some((row) => nfl.has(fantasyPos(row.position)))) {
    return pairBySlot(left, right)
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const bucket = (rows) => {
    const map = {}
    for (const row of rows) {
      const pos = fantasyPos(row.position)
      if (!map[pos]) map[pos] = []
      map[pos].push(row)
    }
    return map
  }
  const leftBuckets = bucket(left)
  const rightBuckets = bucket(right)
  const pairs = []
  for (const pos of order) {
    const a = leftBuckets[pos] || []
    const b = rightBuckets[pos] || []
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      pairs.push({
        key: `${pos}-${i}`,
        label: n > 1 ? `${pos}${i + 1}` : pos,
        left: a[i] || null,
        right: b[i] || null,
      })
    }
  }
  return pairs
}

function pairStarters(leftRows, rightRows) {
  return pairLineup(startersOf(leftRows), startersOf(rightRows))
}

function pairBench(leftRows, rightRows) {
  return pairLineup(benchOf(leftRows), benchOf(rightRows))
}

function isDefense(row) {
  const p = String(row?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return p === 'DEF' || p === 'DST' || p === 'D'
}

function teamAbbrev(row) {
  return String(row?.nfl_team || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

function PlayerAvatar({ row, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const team = teamAbbrev(row)
  const letter = String(row?.player_name || team || '?').slice(0, 1).toUpperCase()
  const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'

  if (isDefense(row) && team && !failed) {
    return (
      <img
        src={`/sports/nfl/logos/${team}.png`}
        alt=""
        className={`${box} shrink-0 object-contain`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    )
  }

  if (!row?.headshot_url || failed) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center text-xs font-bold text-zinc-400`}>
        {letter}
      </span>
    )
  }

  return (
    <span className={`relative ${box} shrink-0 overflow-hidden`}>
      <img
        src={row.headshot_url}
        alt=""
        className="absolute inset-0 h-full w-full origin-[center_22%] scale-[1.42] object-cover object-[center_18%]"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function pts(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(1)
}

function cents(price) {
  const n = Number(price)
  if (!Number.isFinite(n) || n <= 0) return ''
  const p = n <= 1 ? n * 100 : n
  return `${Math.round(p)}¢`
}

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  const tail = ['th', 'st', 'nd', 'rd']
  return `${n}${tail[n % 10] || 'th'}`
}

function standingsRank(team, teams) {
  if (!team) return null
  const sorted = [...(teams || [])].sort((a, b) => {
    const wins = (Number(b.wins) || 0) - (Number(a.wins) || 0)
    if (wins) return wins
    return (Number(b.points_for) || 0) - (Number(a.points_for) || 0)
  })
  const i = sorted.findIndex((t) => t.id === team.id)
  return i < 0 ? null : i + 1
}

function gameStarted(card) {
  if (!card || card.bye) return false
  const st = String(card.game_status || '').toLowerCase()
  if (['in_progress', 'inprogress', 'live', 'complete', 'closed', 'final', 'post'].includes(st)) return true
  if (card.kickoff) {
    const t = Date.parse(card.kickoff)
    if (Number.isFinite(t) && t <= Date.now()) return true
  }
  return false
}

/** Starter total. Before kickoff this is the projection. After, live points so far plus remaining projections. */
function sideOutlook(roster, cards) {
  const starters = startersOf(roster)
  let projected = 0
  let projectedN = 0
  let scored = 0
  let started = false
  let outlook = 0
  let outlookOk = false
  for (const row of starters) {
    const card = row?.sleeper_id ? cards?.[row.sleeper_id] : null
    if (!card) continue
    const p = Number(card.projected)
    const hasP = Number.isFinite(p)
    if (hasP) {
      projected += p
      projectedN += 1
    }
    if (gameStarted(card)) {
      started = true
      const w = Number(card.week_pts)
      const pts = Number.isFinite(w) ? w : 0
      scored += pts
      outlook += pts
      outlookOk = true
    } else if (hasP) {
      outlook += p
      outlookOk = true
    }
  }
  return {
    live: started,
    projected: projectedN ? projected : null,
    scored: started ? scored : null,
    outlook: outlookOk ? outlook : null,
  }
}

function displayScore(outlook, hostScore) {
  if (!outlook?.live) {
    if (outlook?.projected != null) return { text: outlook.projected.toFixed(1), live: false }
    return { text: '–', live: false }
  }
  const host = Number(hostScore)
  if (Number.isFinite(host) && host > 0) return { text: host.toFixed(1), live: true }
  if (outlook.scored != null) return { text: outlook.scored.toFixed(1), live: true }
  return { text: '0.0', live: true }
}

function normCdf(x) {
  const sign = x < 0 ? -1 : 1
  const a = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a))
  return 0.5 * (1 + sign * y)
}

/** Weekly win chance from the two outlooks. σ 28 is a typical fantasy margin, not a book price. */
function winChance(left, right) {
  if (left == null || right == null) return null
  const p = normCdf((left - right) / 28)
  return Math.min(0.97, Math.max(0.03, p))
}

const MAIN_STAT = { QB: 'pass_yds', RB: 'rush_yds', WR: 'rec_yds', TE: 'rec_yds' }

function propStat(prop) {
  if (prop?.stat) return prop.stat
  const t = String(prop?.label || '').toLowerCase()
  if (/rush/.test(t) && /rec/.test(t)) return 'rr_yds'
  if (/pass/.test(t) && /yd/.test(t)) return 'pass_yds'
  if (/rush/.test(t) && /yd/.test(t)) return 'rush_yds'
  if (/rec/.test(t) && /yd/.test(t)) return 'rec_yds'
  return ''
}

function pickMainProp(row, card) {
  const want = MAIN_STAT[fantasyPos(row?.position)]
  if (!want) return null
  return (card?.props || []).find((p) => propStat(p) === want) || null
}

function extraProps(row, card, main) {
  const list = card?.props || []
  return list.filter((p) => p !== main)
}

function SiteBadge({ provider }) {
  const tone =
    {
      espn: 'bg-[#e52534]',
      sleeper: 'bg-[#0f8f6f]',
      yahoo: 'bg-[#6001d2]',
      cbs: 'bg-[#0b63ce]',
    }[provider] || 'bg-zinc-700'
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${tone}`} style={{ color: '#fff' }}>
      {providerLabel(provider) || 'League'}
    </span>
  )
}

function YesNoPills({ prop }) {
  const yes = prop?.price
  const no = prop?.no != null ? prop.no : yes != null ? Math.max(0, 1 - Number(yes)) : null
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-zinc-700/80">
      <span className="fantasy-yes inline-flex min-w-[2rem] items-center justify-center bg-emerald-500/15 px-1.5 py-1 text-[12px] font-bold tabular-nums text-emerald-300">
        {cents(yes) || '-'}
      </span>
      <span className="fantasy-no inline-flex min-w-[2rem] items-center justify-center border-l border-zinc-700/80 bg-rose-500/10 px-1.5 py-1 text-[12px] font-bold tabular-nums text-rose-300">
        {cents(no) || '-'}
      </span>
    </span>
  )
}

function gameWhen(card) {
  if (card?.kickoff) {
    const d = new Date(card.kickoff)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    }
  }
  if (card?.game_date) {
    const d = new Date(`${card.game_date}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return ''
}

function injuryPill(status) {
  const label = injuryLabel(status)
  if (!label) return null
  const out = label === 'Out' || label === 'IR'
  return (
    <span
      className={`shrink-0 rounded px-1 text-[9px] font-bold uppercase ${
        out ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-500/15 text-rose-300'
      }`}
    >
      {label}
    </span>
  )
}

function MarketLine({ prop, align }) {
  if (!prop?.label) return null
  const towardCenter = align === 'left'
  return (
    <div className={`mt-1 flex items-center gap-1.5 ${towardCenter ? 'justify-end' : 'justify-start'}`}>
      {towardCenter ? (
        <span className="min-w-0 truncate text-[10px] font-semibold text-sky-300">{prop.label}</span>
      ) : null}
      <YesNoPills prop={prop} />
      {towardCenter ? null : (
        <span className="min-w-0 truncate text-[10px] font-semibold text-sky-300">{prop.label}</span>
      )}
    </div>
  )
}

function ExtraMarkets({ props, align }) {
  const [open, setOpen] = useState(false)
  if (!props?.length) return null
  const towardCenter = align === 'left'
  return (
    <div className={`mt-1 ${towardCenter ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-semibold text-zinc-500"
      >
        {open ? 'Hide markets' : 'Markets'}
      </button>
      {open
        ? props.map((prop) => (
            <div
              key={prop.label}
              className={`mt-1 flex items-center gap-1.5 ${towardCenter ? 'justify-end' : 'justify-start'}`}
            >
              {towardCenter ? (
                <span className="min-w-0 truncate text-[10px] text-zinc-400">{prop.label}</span>
              ) : null}
              <YesNoPills prop={prop} />
              {towardCenter ? null : (
                <span className="min-w-0 truncate text-[10px] text-zinc-400">{prop.label}</span>
              )}
            </div>
          ))
        : null}
    </div>
  )
}

function VsSide({ row, card, align }) {
  if (!row) return <div />
  const when = gameWhen(card)
  const side = card?.bye ? 'Bye' : card?.opponent ? `${card.home ? 'vs' : '@'} ${card.opponent}` : ''
  const gameLine = [when, side].filter(Boolean).join(' ')
  const main = pickMainProp(row, card)
  const extras = extraProps(row, card, main)
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <PlayerAvatar row={row} size="sm" />
        <div className="min-w-0">
          <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
            <span className="truncate text-[12px] font-bold tracking-wide text-zinc-100">
              {shortName(row.player_name, row.position)}
            </span>
            {injuryPill(row.injury_status)}
          </div>
          <div className="truncate text-[10px] text-zinc-500">
            {fantasyPos(row.position) || row.position}
            {row.nfl_team ? ` · ${row.nfl_team}` : ''}
          </div>
        </div>
      </div>
      {gameLine ? <div className="mt-0.5 truncate text-[10px] text-zinc-500">{gameLine}</div> : null}
      <MarketLine prop={main} align={align} />
      <ExtraMarkets props={extras} align={align} />
    </div>
  )
}

function playerPts(card, loading) {
  if (card && gameStarted(card) && card.week_pts != null) return pts(card.week_pts) || '0.0'
  const proj = pts(card?.projected)
  if (proj) return proj
  return loading ? '…' : '-'
}

function MatchupRows({ pairs, cards, cardsLoading, bench }) {
  if (!pairs.length) return null
  return (
    <>
      {pairs.map((pair) => {
        const rowKey = `${bench ? 'b' : 's'}-${pair.key}`
        const leftCard = pair.left?.sleeper_id ? cards?.[pair.left.sleeper_id] : null
        const rightCard = pair.right?.sleeper_id ? cards?.[pair.right.sleeper_id] : null
        return (
          <li
            key={rowKey}
            className={`border-b border-zinc-800/80 last:border-b-0 ${bench ? 'fantasy-bench-row' : ''}`}
          >
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5 px-2 py-2.5">
              <VsSide row={pair.left} card={leftCard} align="left" />
              <div className="flex items-center gap-1 pt-1">
                <span className="w-8 text-right text-[13px] font-bold tabular-nums text-zinc-100">
                  {playerPts(leftCard, cardsLoading)}
                </span>
                <span
                  className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ color: '#fff' }}
                >
                  {pair.label}
                </span>
                <span className="w-8 text-[13px] font-bold tabular-nums text-zinc-100">
                  {playerPts(rightCard, cardsLoading)}
                </span>
              </div>
              <VsSide row={pair.right} card={rightCard} align="right" />
            </div>
          </li>
        )
      })}
    </>
  )
}

function VsMatchup({ mine, opp, cards, cardsLoading }) {
  const starters = pairStarters(mine, opp)
  const bench = pairBench(mine, opp)
  if (!starters.length && !bench.length) {
    return <p className="px-1 text-[13px] text-zinc-500">No players synced for this matchup.</p>
  }
  return (
    <ul>
      <MatchupRows pairs={starters} cards={cards} cardsLoading={cardsLoading} />
      <MatchupRows pairs={bench} cards={cards} cardsLoading={cardsLoading} bench />
    </ul>
  )
}

function matchupPages(detail) {
  const teams = detail?.teams || []
  const byId = Object.fromEntries(teams.map((t) => [t.id, t]))
  const byTeam = detail?.rostersByTeam || {}
  const mine = teams.find((t) => t.is_mine) || null
  const matchups = detail?.matchups || []
  const usedTeams = new Set()
  const out = []

  const pushPair = (mu, preferLeftId) => {
    if (!mu?.mine_team_id) return
    const pairKey = [mu.mine_team_id, mu.opp_team_id].filter(Boolean).sort().join(':')
    if (out.some((page) => page.key === pairKey)) return
    let leftId = mu.mine_team_id
    let rightId = mu.opp_team_id || null
    let leftScore = mu.mine_score
    let rightScore = mu.opp_score
    if (preferLeftId && preferLeftId === rightId) {
      leftId = rightId
      rightId = mu.mine_team_id
      leftScore = mu.opp_score
      rightScore = mu.mine_score
    }
    usedTeams.add(leftId)
    if (rightId) usedTeams.add(rightId)
    out.push({
      key: pairKey,
      kind: rightId ? 'matchup' : 'bye',
      left: byId[leftId] || null,
      right: rightId ? byId[rightId] || null : null,
      leftScore,
      rightScore,
      yours: Boolean(mine && (leftId === mine.id || rightId === mine.id)),
      roster: byTeam[leftId] || [],
      oppRoster: rightId ? byTeam[rightId] || [] : [],
    })
  }

  const mineMu = matchups.find(
    (mu) => mu.mine_team_id === mine?.id || mu.opp_team_id === mine?.id,
  )
  if (mineMu) pushPair(mineMu, mine?.id)
  for (const mu of matchups) pushPair(mu, null)

  const unpaired = teams.filter((t) => !usedTeams.has(t.id))
  if (unpaired.length && unpaired.length < matchups.length) {
    for (const t of unpaired) {
      out.push({
        key: `bye-${t.id}`,
        kind: 'bye',
        left: t,
        right: null,
        leftScore: null,
        rightScore: null,
        yours: Boolean(mine && t.id === mine.id),
        roster: byTeam[t.id] || [],
        oppRoster: [],
      })
    }
  }
  return out
}

const SPORT_ORDER = ['nfl', 'nba', 'mlb', 'nhl']
const SPORT_LABEL = { nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL' }

function ScoreSide({ team, teams, outlook, hostScore, align }) {
  const score = displayScore(outlook, hostScore)
  const rank = standingsRank(team, teams)
  const end = align === 'right'
  return (
    <div className={`min-w-0 px-3 py-3 ${end ? 'text-right' : 'text-left'}`}>
      <div className={`flex items-center gap-2 ${end ? 'flex-row-reverse' : ''}`}>
        <TeamLogo team={team} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{team?.team_name || 'Team'}</div>
          <div className="text-[11px] text-zinc-500">
            {rank ? `${ordinal(rank)} · ` : ''}
            {recordLine(team)}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[26px] font-bold tabular-nums leading-none">{score.text}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {score.live ? 'Live' : score.text === '–' ? '' : 'Proj'}
      </div>
    </div>
  )
}

function WinBar({ left, right }) {
  const p = winChance(left, right)
  if (p == null) return null
  const leftPct = Math.round(p * 100)
  const rightPct = 100 - leftPct
  return (
    <div className="border-t border-zinc-800 px-3 py-2">
      <div className="mb-1 flex justify-between text-[11px] font-semibold tabular-nums text-zinc-300">
        <span>{leftPct}%</span>
        <span>{rightPct}%</span>
      </div>
      <div className="fantasy-win-track flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="fantasy-win-fill h-full bg-sky-400" style={{ width: `${leftPct}%` }} />
      </div>
    </div>
  )
}

function MatchupCard({ page, teams, week, provider, cards }) {
  const leftOut = sideOutlook(page.roster, cards)
  const rightOut = sideOutlook(page.oppRoster, cards)
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
      <div className={`grid ${page.right ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        <ScoreSide team={page.left} teams={teams} outlook={leftOut} hostScore={page.leftScore} align="left" />
        {page.right ? (
          <div className="flex flex-col items-center justify-center px-1 py-3">
            <SiteBadge provider={provider} />
            <div className="mt-1 text-[10px] font-semibold text-zinc-500">
              {week != null ? `Week ${week}` : 'This week'}
            </div>
          </div>
        ) : null}
        {page.right ? (
          <ScoreSide team={page.right} teams={teams} outlook={rightOut} hostScore={page.rightScore} align="right" />
        ) : (
          <p className="px-3 pb-3 text-[12px] text-zinc-500">Bye this week.</p>
        )}
      </div>
      {page.right ? <WinBar left={leftOut.outlook} right={rightOut.outlook} /> : null}
    </div>
  )
}

/**
 * Connected fantasy home. Hosts live in the manage sheet, not on this page.
 * Home is the matchup cards, grouped by sport. A tap opens that league:
 * the matchup stays on top, the lineup sits under it, and the other games are a swipe.
 */
export default function FantasyCommandCenter({
  leagues,
  details,
  loadingDetail,
  cards,
  cardsLoading,
  busy,
  onSetPrimary,
  onOpenManage,
  onSync,
}) {
  const [leagueId, setLeagueId] = useState(null)
  const [pageKey, setPageKey] = useState(null)
  const [tool, setTool] = useState('start')
  const touchX = useRef(null)
  const activeTool = TOOLS.find((t) => t.id === tool) || TOOLS[0]

  const groups = useMemo(() => {
    const by = new Map()
    for (const lg of leagues || []) {
      const sport = String(lg.sport || 'nfl').toLowerCase()
      if (!by.has(sport)) by.set(sport, [])
      by.get(sport).push(lg)
    }
    return [...by.keys()]
      .sort((a, b) => {
        const ia = SPORT_ORDER.indexOf(a)
        const ib = SPORT_ORDER.indexOf(b)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      .map((sport) => ({
        sport,
        label: SPORT_LABEL[sport] || sport.toUpperCase(),
        leagues: by.get(sport),
      }))
  }, [leagues])

  const selected = leagueId ? (leagues || []).find((lg) => lg.id === leagueId) || null : null
  const detail = selected ? details?.[selected.id] || null : null
  const pages = useMemo(() => (detail ? matchupPages(detail) : []), [detail])
  const keyed = pages.findIndex((item) => item.key === pageKey)
  const safePage = keyed >= 0 ? keyed : 0
  const current = pages[safePage] || null

  const openMatchup = (id, key) => {
    setLeagueId(id)
    setPageKey(key)
    void onSetPrimary?.(id)
  }

  const stepPage = (dir) => {
    const next = Math.min(pages.length - 1, Math.max(0, safePage + dir))
    const item = pages[next]
    if (item) setPageKey(item.key)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {leagueId ? (
          <button
            type="button"
            onClick={() => setLeagueId(null)}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200"
          >
            Fantasy
          </button>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSync()}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            {busy ? '…' : 'Sync'}
          </button>
          <button
            type="button"
            onClick={onOpenManage}
            className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-950"
          >
            Manage
          </button>
        </div>
      </div>

      {!loadingDetail && !(leagues || []).length ? (
        <div className="rounded-2xl border border-zinc-800 p-4 text-[13px] text-zinc-400">
          No leagues synced yet. Open Manage and sync after the league is live.
        </div>
      ) : null}

      {!leagueId ? (
        <>
          {loadingDetail && !(leagues || []).some((lg) => details?.[lg.id]) ? (
            <div className="py-6 text-center text-sm text-zinc-500">Loading matchups…</div>
          ) : null}
          {groups.map((group) => {
            const matchups = group.leagues.flatMap((lg) => {
              const leagueDetail = details?.[lg.id]
              if (!leagueDetail) return []
              return matchupPages(leagueDetail)
                .filter((item) => item.yours)
                .map((item) => ({ lg, item, leagueDetail }))
            })
            if (!matchups.length && !loadingDetail) return null
            return (
              <section key={group.sport} className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{group.label}</div>
                {matchups.map(({ lg, item, leagueDetail }) => (
                  <button
                    key={`${lg.id}-${item.key}`}
                    type="button"
                    onClick={() => openMatchup(lg.id, item.key)}
                    className="block w-full border-0 bg-transparent p-0 text-left"
                  >
                    <MatchupCard
                      page={item}
                      teams={leagueDetail.teams}
                      week={leagueDetail.week}
                      provider={lg.provider || leagueDetail.league?.provider}
                      cards={cards}
                    />
                  </button>
                ))}
              </section>
            )
          })}
        </>
      ) : (
        <>
          {selected && !detail && loadingDetail ? (
            <div className="py-6 text-center text-sm text-zinc-500">Loading league…</div>
          ) : null}

          {detail && !pages.length ? (
            <div className="rounded-2xl border border-zinc-800 px-3 py-3 text-[12px] text-zinc-500">
              No matchup synced for this week.
            </div>
          ) : null}

          {current ? (
            <div
              onTouchStart={(e) => {
                touchX.current = e.changedTouches?.[0]?.clientX ?? null
              }}
              onTouchEnd={(e) => {
                const start = touchX.current
                const end = e.changedTouches?.[0]?.clientX
                touchX.current = null
                if (start == null || end == null || pages.length < 2) return
                const dx = end - start
                if (dx < -48) stepPage(1)
                if (dx > 48) stepPage(-1)
              }}
            >
              <MatchupCard
                page={current}
                teams={detail?.teams || []}
                week={detail?.week}
                provider={selected?.provider || detail?.league?.provider}
                cards={cards}
              />
            </div>
          ) : null}

          {pages.length > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={safePage <= 0}
                onClick={() => stepPage(-1)}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-30"
              >
                Prev
              </button>
              <div className="text-[12px] text-zinc-500">
                {safePage + 1} / {pages.length}
              </div>
              <button
                type="button"
                disabled={safePage >= pages.length - 1}
                onClick={() => stepPage(1)}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          ) : null}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {TOOLS.map((item) => {
              const on = item.id === tool
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTool(item.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                    on ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
          <p className="text-[13px] leading-snug text-zinc-400">{activeTool.body}</p>

          {current ? (
            <VsMatchup
              mine={current.roster}
              opp={current.oppRoster}
              cards={cards}
              cardsLoading={cardsLoading}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
