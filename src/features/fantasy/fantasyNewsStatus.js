/**
 * Read player status out of fresh news (Rotowire / insider notes) so a starter who is ruled out shows as Out and
 * Start/Sit swaps him before the host or Sleeper status catches up. News only raises the injury level, never clears
 * a designation, and in-game notes ("won't return", "carted off") never set next week's status.
 */
import { injuryKey } from './fantasyStartSit.js'

const STATUS_WINDOW_MS = 36 * 60 * 60 * 1000
const FLAG_WINDOW_MS = 24 * 60 * 60 * 1000

/** Forward-looking absence beats any in-game wording in the same note ("expected to miss time after leaving in the 2nd"). */
const MISS_TIME = /\b((will|expected to|set to|likely to) miss|miss (some|significant|extended|multiple) (time|games|weeks)|out (multiple|several) weeks|out indefinitely)\b/i
const SEASON = /\b(rest|remainder) of the (season|year)\b|\bseason[- ]ending\b|\bout for the season\b/i
const IN_GAME = /\b(remainder of|rest of|(won'?t|will not) return|questionable to return|doubtful to return|return to (the )?game|locker room|carted|blue tent|sideline|halftime|in the (first|second|third|fourth) quarter)\b/i
const ACTIVATED = /\b(activated|reinstated|returns? from|back from)\b.*\b(injured reserve|ir|pup|suspension)\b/i
const CLEARED = /\b(will play|is active|(listed as )?active (sunday|monday|thursday|saturday|for)|expected to play|cleared|off the injury report|(no|without an|does not have an) injury designation|practiced fully|full participant|will start|set to play|good to go|on track to play|(listed as )?probable)\b/i
const OUT = /\b(ruled out|will not play|won'?t play|out for (sunday|monday|thursday|saturday|week \d+)|is out (sunday|monday|thursday|saturday|this week)|inactive|injured reserve|(to|on) ir|out indefinitely)\b/i
const DOUBTFUL = /\bdoubtful\b/i
const QUESTIONABLE = /\bquestionable\b/i

/** Insider news types (LLM `kind`) that change who plays or starts. */
const LINEUP_KINDS = new Set(['status', 'role', 'transaction', 'in_game'])
/** Availability, injury, role and roster words. A box-score recap ("tallied 23 points ...") has none of them. */
const LINEUP_TERMS =
  /\b(injur\w*|ankle|knee|hamstring|groin|calf|foot|feet|wrist|hand|finger|thumb|shoulder|hip|elbow|neck|achilles|concussion|illness|sick|soreness|sore|strain(ed)?|sprain(ed)?|surgery|fracture|rest(ed|ing)?|load management|day-to-day|game-time decision|available|unavailable|will play|won'?t play|(will|won'?t) start|starting lineup|starting role|start(s|ed)? in place|move(d|s)? (to|into) the (bench|starting lineup)|to the bench|benched|minutes (restriction|limit)|limited (practice|minutes)|(did not|didn'?t) practice|return(s|ed)? (to|from)|suspend\w*|traded|trade[sd]? to|signed|waived|released|assigned|recalled|g league|two-way|depth chart|activated|reinstated|personal reasons|out (for|with|indefinitely))\b/i

/**
 * News that matters for lineups (injury / availability / role / transactions), not stat recaps. Reads the headline
 * only: a recap's story is analysis that names other players' injuries and past moves ("with Beal (knee) out").
 */
export function lineupNews(note) {
  if (LINEUP_KINDS.has(String(note?.topic || ''))) return true
  const head = { headline: note?.headline || '', player: note?.player }
  if (noteStatus(head)) return true
  return LINEUP_TERMS.test(noteText(head))
}

const RANK = { '': 0, questionable: 1, doubtful: 2, out: 3 }
const LABEL = { questionable: 'Questionable', doubtful: 'Doubtful', out: 'Out' }

/** Hypotheticals ("If Curry suffers a setback ... he'll miss time") never set a status. */
const CONDITIONAL = /^(if|should|in the event|assuming)\b/i

/** Surname the note's own player goes by in Rotowire / insider copy ("Aaron Jones Sr." -> "Jones"). */
function surnameOf(player) {
  const words = String(player || '')
    .trim()
    .split(/\s+/)
    .filter((w) => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(w))
  const last = words[words.length - 1] || ''
  return last.length >= 2 ? last : ''
}

/** Clause breaks where copy hands off to another player ("..., as fellow RB Jordan Mason (thumb) is questionable"). */
const CLAUSE_BREAK = /,|;|\s--?\s|\s(?:after|with|while|because|since|but|and|although|though|due to|given that|now that|until|as (?=(?:fellow|teammate|[A-Z])))\s?/
/** Another player in the clause: an injury tag ("Rice (hamstring/knee)") or a first + last name ("Jordan Mason"). */
const INJURY_TAGGED = /\b[A-Z][A-Za-z'.-]+\s*\([a-z][a-z/ ,-]*\)/
const FULL_NAME = /\b[A-Z][a-z'.-]+\s+[A-Z][A-Za-z'.-]+/

function nameRe(surname) {
  return new RegExp(`\\b${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
}

/**
 * Only the clauses about this player. Teammate news rides along in his notes ("Rashee Rice (hamstring/knee) was
 * ruled out", "Mason -- who is still on IR"), and reading those as his status benched healthy starters.
 */
function subjectClauses(sentence, mine) {
  return sentence
    .split(CLAUSE_BREAK)
    .filter((clause) => mine.test(clause) || !(INJURY_TAGGED.test(clause) || FULL_NAME.test(clause)))
    .join(', ')
}

/** `subjectOnly` keeps just the clauses about the note's player (status); off, teammate news still flags the row. */
function noteText(note, { subjectOnly = false } = {}) {
  const sentences = `${note?.headline || ''} ${note?.story || ''}`
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() && !CONDITIONAL.test(sentence.trim()))
  const surname = subjectOnly ? surnameOf(note?.player) : ''
  if (!surname) return sentences.join(' ')
  const mine = nameRe(surname)
  return sentences
    .filter((sentence) => mine.test(sentence))
    .map((sentence) => subjectClauses(sentence, mine))
    .join(' ')
}

/** 'out' | 'doubtful' | 'questionable' | 'cleared' | '' for one note. */
export function noteStatus(note) {
  const text = noteText(note, { subjectOnly: true })
  if (SEASON.test(text) || MISS_TIME.test(text)) return 'out'
  if (IN_GAME.test(text)) return ''
  if (ACTIVATED.test(text)) return 'cleared'
  if (OUT.test(text)) return 'out'
  if (DOUBTFUL.test(text)) return 'doubtful'
  if (CLEARED.test(text)) return 'cleared'
  if (QUESTIONABLE.test(text)) return 'questionable'
  return ''
}

/**
 * Per sleeper id: latest fresh lineup note (for the row flag / panel) and the status the newest decisive note implies.
 * `notes` is the Player news list (newest first is not assumed).
 */
export function newsByPlayer(notes, now = Date.now()) {
  const out = new Map()
  const sorted = [...(notes || [])].sort((a, b) => Date.parse(b.published || '') - Date.parse(a.published || ''))
  for (const note of sorted) {
    const id = String(note?.sleeper_id || '')
    const at = Date.parse(note?.published || '')
    if (!id || !Number.isFinite(at)) continue
    const entry = out.get(id) || { latest: null, status: '', statusNote: null, decided: false }
    // The row flag and panel note are for lineup news only (recaps stay in the Player news list).
    if (!entry.latest && now - at <= FLAG_WINDOW_MS && lineupNews(note)) entry.latest = note
    if (!entry.decided && now - at <= STATUS_WINDOW_MS) {
      const s = noteStatus(note)
      if (s) {
        entry.decided = true
        if (s !== 'cleared') {
          entry.status = s
          entry.statusNote = note
        }
      }
    }
    out.set(id, entry)
  }
  return out
}

/** Copy of league details with news applied to rostered rows: `news_note`, and a raised `injury_status`. */
export function withNews(details, news, sport = 'nfl') {
  if (!details || !news?.size) return details
  const next = {}
  for (const [leagueId, detail] of Object.entries(details)) {
    const byTeam = detail?.rostersByTeam
    // News is keyed by Sleeper ids per sport; sports reuse the same numbers (1945 is Boswell and Trae Young).
    if (!byTeam || String(detail?.league?.sport || 'nfl').toLowerCase() !== sport) {
      next[leagueId] = detail
      continue
    }
    const rosters = {}
    for (const [teamId, rows] of Object.entries(byTeam)) {
      rosters[teamId] = (rows || []).map((row) => {
        const entry = row?.sleeper_id ? news.get(String(row.sleeper_id)) : null
        if (!entry) return row
        const patch = {}
        if (entry.latest) patch.news_note = entry.latest
        if (entry.status && RANK[entry.status] > RANK[injuryKey(row.injury_status)]) {
          patch.injury_status = LABEL[entry.status]
          patch.news_status = entry.statusNote
        }
        return Object.keys(patch).length ? { ...row, ...patch } : row
      })
    }
    next[leagueId] = { ...detail, rostersByTeam: rosters }
  }
  return next
}

/** "now", "12m", "3h", "2d", or a short date. */
export function newsTimeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  const mins = Math.max(0, Math.round((now - t) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
