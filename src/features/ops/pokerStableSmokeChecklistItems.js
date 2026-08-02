/** @typedef {{ id: string, label: string, hint?: string }} SmokeChecklistItem */
/** @typedef {{ id: string, title: string, intro?: string, items: SmokeChecklistItem[] }} SmokeChecklistSection */

/** @type {SmokeChecklistSection[]} */
export const POKER_STABLE_SMOKE_SECTIONS = [
  {
    id: 'A',
    title: 'Setup',
    intro: 'Fresh stake or reuse chunkyunc backing on lvslotpro.com.',
    items: [
      {
        id: 'A1',
        label: 'Player: Bankroll + Stake — cash backing, 2 Edge slices, baseline + roll set.',
      },
      {
        id: 'A2',
        label: 'Backer(s): Stable — accept slice(s).',
      },
      {
        id: 'A3',
        label: 'Player: Carousel shows On stake (not stuck Pending); poll/Realtime OK if accept while on Bankroll.',
      },
      {
        id: 'A4',
        label: 'Player: Log 1–2 On stake sessions (ideally roll above baseline for settle math).',
      },
    ],
  },
  {
    id: 'B',
    title: 'Top-up + pro-rata backer debit',
    items: [
      {
        id: 'B1',
        label: 'Player: Terms → Open ledger → top-up (e.g. $10k).',
      },
      {
        id: 'B2',
        label: 'Deal: Baseline and roll both increase; makeup recalcs against new baseline.',
      },
      {
        id: 'B3',
        label: 'Backer: Each Edge backer personal bankroll debited pro-rata by action %.',
      },
      {
        id: 'B4',
        label: 'History: Bankroll timeline shows Re-up $X on active stake.',
      },
    ],
  },
  {
    id: 'C',
    title: 'Standalone reduce stake',
    items: [
      {
        id: 'C1',
        label: 'Player: Deal detail → Reduce stake checkbox → new baseline below current.',
      },
      {
        id: 'C2',
        label: 'UI: Reduction label + pro-rata backer credit preview matches action %.',
      },
      {
        id: 'C3',
        label: 'Confirm reduction → baseline and roll drop by reduction amount.',
      },
      {
        id: 'C4',
        label: 'Backer: Personal bankrolls credited pro-rata (inverse of top-up).',
      },
      {
        id: 'C5',
        label: 'History: Timeline shows Reduce stake $X.',
      },
    ],
  },
  {
    id: 'D',
    title: 'Settlement sync — periodic',
    items: [
      {
        id: 'D1',
        label: 'Player: Propose periodic settle (no reduction first).',
      },
      {
        id: 'D2',
        label: 'Stake stays open until backer confirms; pending proposal visible on deal detail.',
      },
      {
        id: 'D3',
        label: 'Backer: Alert/push → Confirm (or stableSettlement= deep link modal).',
      },
      {
        id: 'D4',
        label: 'On accept: roll resets to baseline; ledger entries for player + backers with readable copy.',
      },
      {
        id: 'D5',
        label: 'Deny path: propose → backer Deny → no settle applied; stake still active.',
        hint: 'Separate run or second stake if needed.',
      },
    ],
  },
  {
    id: 'E',
    title: 'Periodic settle with stake reduction',
    items: [
      {
        id: 'E1',
        label: 'Player: Periodic settle → Reduce stake → new baseline below current.',
      },
      {
        id: 'E2',
        label: 'UI: Same reduction preview as standalone; Propose periodic settle button.',
      },
      {
        id: 'E3',
        label: 'Backer confirms.',
      },
      {
        id: 'E4',
        label: 'Settle applies and baseline/roll reduced; backer personal credits pro-rata.',
      },
      {
        id: 'E5',
        label: 'History: Reduce stake $X line appears (may share timestamp with settle).',
      },
    ],
  },
  {
    id: 'F',
    title: 'Close stake + archive',
    items: [
      {
        id: 'F1',
        label: 'Player: Close stake (propose) → backer confirms.',
      },
      {
        id: 'F2',
        label: 'Deal settled/closed; sessions merge to personal timeline; personal bankroll credits per ledger.',
      },
      {
        id: 'F3',
        label: 'Player: Bankroll ARCHIVE pill → open modal.',
      },
      {
        id: 'F4',
        label: 'Archive timeline: offer, accept, top-up, reduce, settle, close + sessions.',
      },
    ],
  },
  {
    id: 'G',
    title: 'Notifications (v2c)',
    items: [
      { id: 'G1', label: 'Slice invite → backer alert/push.' },
      { id: 'G2', label: 'Session complete on stake → backer alert (if enabled).' },
      { id: 'G3', label: 'Settlement proposed → counterparty alert/push.' },
      { id: 'G4', label: 'Settlement resolved (confirm/deny) → proposer notified.' },
      { id: 'G5', label: 'Tap push → lands on settle modal / correct deal context.' },
    ],
  },
  {
    id: 'H',
    title: 'Regressions / negative checks',
    items: [
      { id: 'H1', label: 'No payment-claim UI anywhere (old IOU flow gone).' },
      {
        id: 'H2',
        label: 'Guest-only stake: periodic settle / close applies immediately (no bilateral wait).',
      },
      {
        id: 'H3',
        label: 'Revoked stake: periodic settle blocked; Close stake still works.',
        hint: 'Optional quick revoke smoke.',
      },
      {
        id: 'H4',
        label: 'Light + dark: deal detail / periodic settle / reduce block readable.',
      },
    ],
  },
]

export const POKER_STABLE_SMOKE_CHECKLIST_KEY = 'poker_stable_v2'
export const POKER_STABLE_SMOKE_CHECKLIST_VERSION = '2026-08-02'

/** @returns {Record<string, { checked: boolean, notes: string, screenshots: string[] }>} */
export function emptySmokeChecklistResponseMap() {
  /** @type {Record<string, { checked: boolean, notes: string, screenshots: string[] }>} */
  const map = {}
  for (const section of POKER_STABLE_SMOKE_SECTIONS) {
    for (const item of section.items) {
      map[item.id] = { checked: false, notes: '', screenshots: [] }
    }
  }
  return map
}

/**
 * @param {unknown} stored
 * @returns {Record<string, { checked: boolean, notes: string, screenshots: string[] }>}
 */
export function mergeSmokeChecklistResponses(stored) {
  const map = emptySmokeChecklistResponseMap()
  if (!Array.isArray(stored)) return map
  for (const row of stored) {
    if (!row || typeof row !== 'object') continue
    const id = String(row.id || '')
    if (!map[id]) continue
    const screenshots = Array.isArray(row.screenshots)
      ? row.screenshots.map((u) => String(u || '').trim()).filter(Boolean)
      : []
    map[id] = {
      checked: Boolean(row.checked),
      notes: typeof row.notes === 'string' ? row.notes : '',
      screenshots,
    }
  }
  return map
}

/**
 * @param {Record<string, { checked: boolean, notes: string, screenshots?: string[] }>} map
 */
export function serializeSmokeChecklistResponses(map) {
  /** @type {{ id: string, section: string, label: string, checked: boolean, notes: string, screenshots: string[] }[]} */
  const rows = []
  for (const section of POKER_STABLE_SMOKE_SECTIONS) {
    for (const item of section.items) {
      const state = map[item.id] || { checked: false, notes: '', screenshots: [] }
      rows.push({
        id: item.id,
        section: section.id,
        label: item.label,
        checked: Boolean(state.checked),
        notes: state.notes || '',
        screenshots: Array.isArray(state.screenshots)
          ? state.screenshots.map((u) => String(u || '').trim()).filter(Boolean)
          : [],
      })
    }
  }
  return rows
}
