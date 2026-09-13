/**
 * Roster / board name → UFC Stats listing name when they differ.
 * Also used to seed public.ufc_fighter_aliases (manual).
 */
export const UFC_STATS_NAME_ALIASES = {
  'Ian Garry': 'Ian Machado Garry',
}

/** Official roster name → other strings that must resolve (Odds API / board). */
export const UFC_MANUAL_BOARD_ALIASES = {
  'Tommy Gantt': ['Thomas Gantt'],
  'Ian Machado Garry': ['Ian Garry'],
  'Ian Garry': ['Ian Machado Garry'],
}
