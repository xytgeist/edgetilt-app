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
const CLEARED = /\b(will play|is active|(listed as )?active (sunday|monday|thursday|saturday|for)|expected to play|cleared|off the injury report|(no|without an|does not have an) injury designation|practiced fully|full participant|will start|set to play|good to go|on track to play)\b/i
const OUT = /\b(ruled out|will not play|won'?t play|out for (sunday|monday|thursday|saturday|week \d+)|is out (sunday|monday|thursday|saturday|this week)|inactive|injured reserve|(to|on) ir|out indefinitely)\b/i
const DOUBTFUL = /\bdoubtful\b/i
const QUESTIONABLE = /\bquestionable\b/i

const RANK = { '': 0, questionable: 1, doubtful: 2, out: 3 }
const LABEL = { questionable: 'Questionable', doubtful: 'Doubtful', out: 'Out' }

function noteText(note) {
  return `${note?.headline || ''} ${note?.story || ''}`
}

/** 'out' | 'doubtful' | 'questionable' | 'cleared' | '' for one note. */
export function noteStatus(note) {
  const text = noteText(note)
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
 * Per sleeper id: latest fresh note (for the row flag / panel) and the status the newest decisive note implies.
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
    if (!entry.latest && now - at <= FLAG_WINDOW_MS) entry.latest = note
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
export function withNews(details, news) {
  if (!details || !news?.size) return details
  const next = {}
  for (const [leagueId, detail] of Object.entries(details)) {
    const byTeam = detail?.rostersByTeam
    if (!byTeam) {
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
