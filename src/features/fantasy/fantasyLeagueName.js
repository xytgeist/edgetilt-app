/**
 * Host default names spell out the format ("New Orleans Pro H2H Most Categories League", "Yahoo H2H-Pts 272329",
 * "Washington Pro H2H Points PPR League"). The app shows the league by the rest ("New Orleans Pro"); the format
 * has its own chip. Falls back to the full name when nothing else is left ("Points League").
 */
const LEAGUE_FORMAT_WORDS =
  /\b(h2h(?:[\s-]*(?:pts|points|cat|cats|categories))?|head[\s-]*to[\s-]*head|most\s+categories|most\s+cats|categories|cats|season\s+points|total\s+points|points|pts|ppr|roto(?:sserie)?|high\s+score|lock[\s-]*in)\b/gi

export function fantasyLeagueDisplayName(name) {
  const full = String(name || '').trim()
  const rest = full
    .replace(LEAGUE_FORMAT_WORDS, ' ')
    .replace(/\bleague\b\s*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-·|:]\s*$/, '')
    .trim()
  return rest || full
}

/** Same row with `name` shortened (keeps `full_name` for tooltips). */
export function withLeagueDisplayName(row) {
  if (!row || typeof row !== 'object' || !row.name) return row
  return { ...row, name: fantasyLeagueDisplayName(row.name), full_name: row.name }
}
