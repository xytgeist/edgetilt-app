export const SPORTS_BET_SOURCES = ['manual', 'game_hub', 'odds_cell', 'slip', 'csv']

export function normalizeSportsBetSource(source, fallback = 'manual') {
  const s = String(source || '')
  return SPORTS_BET_SOURCES.includes(s) ? s : fallback
}

export function sportsBetSourceLabel(source) {
  switch (String(source || '')) {
    case 'odds_cell':
      return 'Hub odds'
    case 'game_hub':
      return 'Game hub'
    case 'slip':
      return 'Slip'
    case 'csv':
      return 'Import'
    default:
      return 'Manual'
  }
}
