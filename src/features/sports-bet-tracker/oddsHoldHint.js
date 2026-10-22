/** Hold-to-log discoverability: one-time tip on game hub lines + learned flag. */

const LEARNED_KEY = 'edge.oddsHold.learned.v1'
const TIP_SHOWS_KEY = 'edge.oddsHold.tipShows.v1'
const LEARNED_EVENT = 'edge:odds-hold-learned'
/** Shown once per device, held or not. */
const TIP_MAX_SHOWS = 1

function read(key) {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function isOddsHoldLearned() {
  return read(LEARNED_KEY) === '1'
}

export function markOddsHoldLearned() {
  if (isOddsHoldLearned()) return
  write(LEARNED_KEY, '1')
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LEARNED_EVENT))
}

export function oddsHoldLearnedEventName() {
  return LEARNED_EVENT
}

export function shouldShowOddsHoldTip() {
  return !isOddsHoldLearned() && Number(read(TIP_SHOWS_KEY) || 0) < TIP_MAX_SHOWS
}

export function countOddsHoldTipShow() {
  write(TIP_SHOWS_KEY, String(Number(read(TIP_SHOWS_KEY) || 0) + 1))
}
