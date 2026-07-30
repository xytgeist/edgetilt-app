/**
 * Canonical tournament game_variant ids for catalog + sessions.
 * Keep in sync with POKER_TOURNAMENT_GAME_VARIANTS in pokerSessionLabels.js
 */

export const POKER_TOURNAMENT_GAME_IDS = new Set([
  'nlh',
  'plo',
  'plo5',
  'plo8',
  'limit_holdem',
  'mixed',
  'custom',
])

/**
 * Normalize free-text / legacy catalog strings to a canonical id (or pass through unknown).
 * @param {string | null | undefined} storedOrText
 * @returns {string}
 */
export function normalizeTournamentGameVariantId(storedOrText) {
  const raw = String(storedOrText || '').trim()
  if (!raw) return 'nlh'

  const key = raw.toLowerCase().replace(/\s+/g, ' ')
  if (POKER_TOURNAMENT_GAME_IDS.has(key)) return key

  const blob = key.replace(/['']/g, '')

  if (blob === 'custom' || blob === 'other') return 'custom'
  if (/mixed|h\.?o\.?r\.?s\.?e|8-game|10-game/.test(blob)) return 'mixed'
  if (/omaha|plo|\bo8\b|hi\/lo|hi-lo|pot.limit omaha/.test(blob)) {
    if (/hi\/lo|hi-lo|\bo8\b|8/.test(blob)) return 'plo8'
    return 'plo'
  }
  if (/limit/.test(blob) && /hold/.test(blob) && !/no.limit|\bnl\b/.test(blob)) {
    return 'limit_holdem'
  }
  if (/hold|nlh|nl he|no.limit hold|texas hold|\bnl\b/.test(blob)) return 'nlh'

  return raw
}

/**
 * Infer canonical id from MTTDB / schedule text fields.
 * @param {...(string | null | undefined)} parts
 * @returns {string}
 */
export function inferTournamentGameVariantFromText(...parts) {
  return normalizeTournamentGameVariantId(parts.filter(Boolean).join(' '))
}

/**
 * @param {string | null | undefined} id
 * @returns {boolean}
 */
export function isKnownTournamentGameVariantId(id) {
  return POKER_TOURNAMENT_GAME_IDS.has(String(id || '').trim().toLowerCase())
}
