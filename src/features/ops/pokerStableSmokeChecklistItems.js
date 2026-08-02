/** @typedef {{ id: string, label: string, hint?: string }} SmokeChecklistItem */
/** @typedef {{ id: string, title: string, intro?: string, items: SmokeChecklistItem[] }} SmokeChecklistSection */

/** @type {SmokeChecklistSection[]} */
export const POKER_STABLE_SMOKE_SECTIONS = [
  {
    id: 'A',
    title: 'Invite / accept / slice flows',
    intro: 'Fresh stake or reuse chunkyunc backing on lvslotpro.com.',
    items: [
      {
        id: 'A1',
        label: 'Player: Bankroll + Stake — cash backing, 2 Edge slices, baseline + roll set (invites sent).',
      },
      {
        id: 'A2',
        label: 'Backer: Stable → Incoming — slice invite visible before accept.',
      },
      {
        id: 'A3',
        label: 'Backer: Accept slice — slice status active; horse/deal visible in Stable.',
      },
      {
        id: 'A4',
        label: 'Player: Carousel shows On stake (not stuck Pending); poll/Realtime OK if accept while on Bankroll.',
      },
      {
        id: 'A5',
        label: 'Second backer: Incoming invite → Accept slice (multi-slice setup).',
      },
      {
        id: 'A6',
        label: 'Slice invite alert/push received (see G1).',
      },
      {
        id: 'A7',
        label: 'Optional: Backer declines slice — player can edit terms / re-offer.',
      },
      {
        id: 'A8',
        label: 'Player: Log 1–2 On stake sessions (ideally roll above baseline for settle math).',
      },
    ],
  },
  {
    id: 'B',
    title: 'Top-up + pro-rata backer debit (commit/sync)',
    items: [
      {
        id: 'B1',
        label: 'Either side: Record top-up (e.g. $10k) from deal detail.',
      },
      {
        id: 'B2',
        label: 'Deal: Baseline and roll both increase; makeup recalcs against new baseline.',
      },
      {
        id: 'B3',
        label: 'Recorder: Their books update immediately (player: deal only; backer: pro-rata debit).',
      },
      {
        id: 'B4',
        label: 'Counterparty: Alert or out-of-sync banner → Commit to my books → personal bankroll + ledger updated.',
      },
      {
        id: 'B5',
        label: 'History: Bankroll timeline shows Re-up $X on active stake.',
      },
    ],
  },
  {
    id: 'C',
    title: 'Standalone reduce stake (commit/sync)',
    items: [
      {
        id: 'C1',
        label: 'Either side: Deal detail → Reduce stake → new baseline below current.',
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
        label: 'Recorder backer credited pro-rata immediately; counterparty Commit to my books for their share.',
      },
      {
        id: 'C5',
        label: 'History: Timeline shows Reduce stake $X.',
      },
    ],
  },
  {
    id: 'D',
    title: 'Periodic settle (commit/sync)',
    items: [
      {
        id: 'D1',
        label: 'Either side: Record periodic settle (no reduction first).',
      },
      {
        id: 'D2',
        label: 'Recorder: Roll resets to baseline on deal; personal bankroll credited on their side.',
      },
      {
        id: 'D3',
        label: 'Counterparty: Out-of-sync banner or alert → Commit to my books.',
      },
      {
        id: 'D4',
        label: 'After sync: ledger entries for player + backers with readable copy.',
      },
      {
        id: 'D5',
        label: 'Optional: Skip sync — counterparty stays out of sync until they commit later.',
      },
    ],
  },
  {
    id: 'E',
    title: 'Periodic settle with stake reduction',
    items: [
      {
        id: 'E1',
        label: 'Either side: Periodic settle → Reduce stake → new baseline below current.',
      },
      {
        id: 'E2',
        label: 'UI: Same reduction preview as standalone; Record periodic settle button.',
      },
      {
        id: 'E3',
        label: 'Counterparties sync pro-rata reduction credits + settle lines.',
      },
      {
        id: 'E4',
        label: 'Settle applies and baseline/roll reduced on deal.',
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
        label: 'Either side: Record close stake.',
      },
      {
        id: 'F2',
        label: 'Deal settled/closed on deal record; counterparty Commit to my books for personal bankroll credit.',
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
    title: 'Notifications',
    items: [
      { id: 'G1', label: 'Slice invite → backer alert/push.' },
      { id: 'G2', label: 'Session complete on stake → backer alert (if enabled).' },
      { id: 'G3', label: 'Stake commit recorded → counterparty alert/push.' },
      { id: 'G4', label: 'Tap push → stableCommit= deep link opens Sync modal.' },
      { id: 'G5', label: 'Deal detail shows Out of sync with last commit when pending.' },
    ],
  },
  {
    id: 'H',
    title: 'Regressions / negative checks',
    items: [
      { id: 'H1', label: 'No payment-claim UI anywhere (old IOU flow gone).' },
      {
        id: 'H2',
        label: 'Guest-only stake: top-up / settle / close still works (single party).',
      },
      {
        id: 'H3',
        label: 'Revoked stake: periodic settle blocked; Close stake still works.',
        hint: 'Optional quick revoke smoke.',
      },
      {
        id: 'H4',
        label: 'Light + dark: deal detail / settle / reduce / sync banner readable.',
      },
    ],
  },
]

export const POKER_STABLE_SMOKE_CHECKLIST_KEY = 'poker_stable_v2'
export const POKER_STABLE_SMOKE_CHECKLIST_VERSION = '2026-08-04'

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
