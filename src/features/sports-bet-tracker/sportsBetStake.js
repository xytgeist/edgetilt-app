const KEY = 'edge.sportsBet.stakeUnits.v1'

export function readLastStakeUnits() {
  try {
    const n = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : '')
    if (Number.isFinite(n) && n > 0) return n
  } catch {
    /* ignore */
  }
  return 1
}

export function writeLastStakeUnits(units) {
  const n = Number(units)
  if (!Number.isFinite(n) || n <= 0) return
  try {
    localStorage.setItem(KEY, String(n))
  } catch {
    /* ignore */
  }
}
