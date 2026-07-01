/** @param {{ machines?: unknown, slug?: string | null } | null | undefined} row */
export function machineForGuideRow(row) {
  const m = row?.machines
  if (m == null) return null
  if (!Array.isArray(m)) return m

  const list = m.filter(Boolean)
  if (list.length === 0) return null
  const gs = typeof row.slug === 'string' ? row.slug.trim().toLowerCase() : ''
  const slugMatch =
    gs && list.find((x) => typeof x.slug === 'string' && x.slug.trim().toLowerCase() === gs)
  const withVi = list.find(
    (x) => x.volatility_index != null && String(x.volatility_index).trim() !== '',
  )
  return slugMatch ?? withVi ?? list[0]
}

/** Map DB `machines.calculator_slug` / slug → AppShell calculator keys. */
export function resolveCalculatorKeyFromMachine(machine) {
  if (!machine) return null
  const { slug, calculator_slug: calc, has_calculator: has } = machine
  if (
    slug === 'buffalo-link' ||
    slug === 'lightning-buffalo-link' ||
    calc === 'buffalo-link' ||
    calc === 'buffalo'
  ) {
    return 'buffalo-link'
  }
  if (slug === 'buffalo-diamond' || slug === 'buffalo-diamond-extreme' || calc === 'buffalo-diamond') {
    return 'buffalo-diamond'
  }
  if (slug === 'stack-up-pays' || calc === 'stack-up-pays') return 'stackup'
  if (slug === 'phoenix-link' || calc === 'phoenix-link') return 'phoenix'
  if (
    slug === 'wheel-of-fortune-4d-collectors-edition' ||
    calc === 'wof-collectors-edition' ||
    calc === 'wheel-of-fortune-4d-collectors-edition'
  ) {
    return 'wof-collectors-edition'
  }
  if (
    slug === 'ainsworth-must-hit-by' ||
    slug === 'must-hit-by-aig' ||
    slug === 'ags-must-hit-by' ||
    slug === 'must-hit-by-ags' ||
    slug === 'igt-must-hit-by' ||
    slug === 'must-hit-by-igt' ||
    calc === 'mhb'
  ) {
    return 'mhb'
  }
  if (slug === 'cash-machine-lock' || calc === 'cash-machine-lock') return null
  if (has && calc === 'mhb') return 'mhb'
  if (has && calc && ['buffalo-link', 'buffalo', 'buffalo-diamond', 'stackup', 'phoenix', 'mhb'].includes(calc)) {
    return calc === 'buffalo' ? 'buffalo-link' : calc
  }
  return null
}
