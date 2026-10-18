/** Position tag colors (game hub Fantasy tab + fantasy lineup cards). Same in both themes. */
export function positionPillClass(pos) {
  switch (pos) {
    case 'QB':
      return 'bg-[#1a2a4a] text-[#7ec8ff] ring-1 ring-[#5aa0d8]/60'
    case 'RB':
      return 'bg-[#2a3230] text-[#7dffb3] ring-1 ring-[#3d4a45]/70'
    case 'WR':
      return 'bg-[#3a2218] text-[#ff9a5c] ring-1 ring-[#6a3a28]/55'
    case 'TE':
      return 'bg-[#3a1520] text-[#f0a8c0] ring-1 ring-[#6a3040]/50'
    case 'K':
      return 'bg-[#2a2818] text-[#f5d76e] ring-1 ring-[#6a5a28]/55'
    case 'DEF':
      return 'bg-[#1a2838] text-[#9ec4e8] ring-1 ring-[#3a5878]/55'
    default:
      return 'bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/50'
  }
}

/** Lineup slot label ("RB1", "D/ST", "FLEX") to a colored position, or null for mixed slots. */
export function slotPillPosition(label) {
  const raw = String(label || '')
    .toUpperCase()
    .replace(/\d+$/, '')
    .replace(/[^A-Z]/g, '')
  if (raw === 'DST' || raw === 'D') return 'DEF'
  if (raw === 'PK') return 'K'
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(raw) ? raw : null
}
