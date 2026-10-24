/**
 * NBA play-by-play → fantasy events for the players in two lineups. ESPN play text names the scorer first
 * ("Tari Eason makes running layup (Alperen Sengun assists)"), the rebounder ("X defensive rebound"), the shot blocker
 * ("X blocks Y's 2-foot layup"), and the thief in a turnover ("Y bad pass turnover (X steals)"). Each player's part
 * becomes a stat line the league's own scoring prices (`scoreLine`).
 */

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function add(into, key, n = 1) {
  into[key] = (into[key] || 0) + n
}

/** One player's stat line from one play, or null when the play does not involve him. */
export function nbaPlayLine(description, playerName) {
  const text = norm(description)
  const name = norm(playerName)
  if (!text || !name) return null
  const line = {}
  const shot = (rest) => {
    if (/free throw/.test(rest)) return 'ft'
    if (/three point/.test(rest)) return '3'
    return '2'
  }
  if (text.startsWith(`${name} makes `)) {
    const kind = shot(text.slice(name.length + 7))
    if (kind === 'ft') {
      add(line, 'pts')
      add(line, 'ftm')
      add(line, 'fta')
    } else {
      add(line, 'pts', kind === '3' ? 3 : 2)
      add(line, 'fgm')
      add(line, 'fga')
      if (kind === '3') add(line, 'tpm')
    }
  } else if (text.startsWith(`${name} misses `)) {
    add(line, shot(text.slice(name.length + 8)) === 'ft' ? 'fta' : 'fga')
  }
  if (text.includes(`(${name} assists)`)) add(line, 'ast')
  if (text.startsWith(`${name} offensive rebound`) || text.startsWith(`${name} defensive rebound`)) add(line, 'reb')
  if (text.startsWith(`${name} blocks `)) add(line, 'blk')
  if (text.includes(`(${name} steals)`)) add(line, 'stl')
  else if (text.startsWith(`${name} `) && /\bturnover\b|\btraveling\b/.test(text)) add(line, 'to')
  return Object.keys(line).length ? line : null
}

const STAT_SHORT = { pts: 'PTS', tpm: '3PM', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', to: 'TO' }

/** "+3 PTS · +1 3PM" for category leagues, where a play has no single points value. */
export function nbaLineLabel(line) {
  return Object.entries(STAT_SHORT)
    .filter(([key]) => line?.[key])
    .map(([key, label]) => `+${line[key]} ${label}`)
    .join(' · ')
}
