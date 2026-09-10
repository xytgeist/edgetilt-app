/** Ops desk switcher … House is the 4-desk composer. Each named desk is an inspect view. */

export const OPS_DESK_HOUSE = 'house'

export const OPS_DESKS = [
  {
    id: 'Scott',
    icon: '🎯',
    title: 'The Model',
    lane: 'Model vs market after PVAL. Fires at 2.5 pts, or 1.5 on a true 3/7 key.',
    badge: 'bg-emerald-950/70 text-emerald-300 ring-emerald-500/30',
    chipOn: 'bg-emerald-500 text-black',
    chipOff: 'bg-zinc-900 text-emerald-300 border-emerald-800/80',
  },
  {
    id: 'Rocco',
    icon: '🥩',
    title: 'Short-fav / Hooks',
    lane: 'Short favorites, hook tax, hurt chalk, pasted chalk-trap. Ugly juice worse than -115 is a hard PASS.',
    badge: 'bg-blue-950/70 text-blue-300 ring-blue-500/30',
    chipOn: 'bg-blue-500 text-white',
    chipOff: 'bg-zinc-900 text-blue-300 border-blue-800/80',
  },
  {
    id: 'Chedda',
    icon: '🧀',
    title: 'Dogs & Money',
    lane: 'Dog + golden hook, dog + model/PVAL, or pasted Action/VSiN sharp money. No street board, no fire.',
    badge: 'bg-amber-950/70 text-amber-300 ring-amber-500/30',
    chipOn: 'bg-amber-500 text-black',
    chipOff: 'bg-zinc-900 text-amber-300 border-amber-800/80',
  },
  {
    id: 'Tank',
    icon: '🛡️',
    title: 'Totals + ATS spots',
    lane: 'Totals first (3.5 / key 48-51-54, wind and falling-total vetoes). ATS spots are rest / weather / tempo / under+dog.',
    badge: 'bg-purple-950/70 text-purple-300 ring-purple-500/30',
    chipOn: 'bg-violet-500 text-white',
    chipOff: 'bg-zinc-900 text-violet-300 border-violet-800/80',
  },
]

export function deskMeta(deskId) {
  return OPS_DESKS.find((d) => d.id === deskId) || null
}

export function isNamedOpsDesk(deskId) {
  return OPS_DESKS.some((d) => d.id === deskId)
}

export function deskEvalsFor(preview, deskId) {
  const board = preview?.deskEvals
  if (!board || !deskId || deskId === OPS_DESK_HOUSE) return []
  const rows = board[deskId]
  return Array.isArray(rows) ? rows : []
}
