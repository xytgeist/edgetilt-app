/**
 * Game Hub fantasy scoring format (Standard / Half PPR / Full PPR), remembered per device. One choice drives
 * the Fantasy tab, H2H cards, YTD, post-play toasts and the landscape Fantasy rail.
 */
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'edgetilt:gameHubFantasyScoring'
const CHANGE_EVENT = 'edgetilt:game-hub-fantasy-scoring'

export const FANTASY_SCORING_OPTIONS = [
  { id: 'std', label: 'Std', long: 'Standard' },
  { id: 'half', label: 'Half', long: 'Half PPR' },
  { id: 'ppr', label: 'PPR', long: 'Full PPR' },
]

const IDS = FANTASY_SCORING_OPTIONS.map((o) => o.id)

export function getFantasyScoring() {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return IDS.includes(v) ? v : 'ppr'
  } catch {
    return 'ppr'
  }
}

export function setFantasyScoring(id) {
  if (!IDS.includes(id)) return
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* private mode */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }))
}

export function nextFantasyScoring(id) {
  return IDS[(IDS.indexOf(id) + 1) % IDS.length]
}

export function fantasyScoringLabel(id) {
  return FANTASY_SCORING_OPTIONS.find((o) => o.id === id)?.label || 'PPR'
}

/** Points per reception for the format. */
export function receptionPoints(id) {
  return id === 'std' ? 0 : id === 'half' ? 0.5 : 1
}

export function useFantasyScoring() {
  const [scoring, setScoring] = useState(getFantasyScoring)
  useEffect(() => {
    const onChange = () => setScoring(getFantasyScoring())
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return scoring
}

const round1 = (n) => Math.round(n * 10) / 10

/**
 * A player's points for `base` (`game` / `projected` / `season` / `last_week`) in the chosen format.
 * Payload carries `${base}_ppr` plus `_half` / `_std` (Sleeper); without those, derive from PPR minus
 * receptions when the matching rec count is known, else fall back to PPR.
 */
export function playerFantasyPts(player, base, scoring) {
  if (!player) return null
  const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)
  const ppr = num(player[`${base}_ppr`]) ?? (base === 'projected' ? num(player.fantasypros_pts) : null)
  if (scoring === 'ppr') return ppr
  const direct = num(player[`${base}_${scoring}`])
  if (direct != null) return direct
  if (ppr == null) return null
  const rec = num(player[`${base}_rec`])
  return rec != null ? round1(ppr - rec * (1 - receptionPoints(scoring))) : ppr
}
