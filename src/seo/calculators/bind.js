/** DOM glue for the public calculators. Math stays in sportsBetCalcMath.js. */

export function field(form, name) {
  const el = form.elements.namedItem(name)
  if (!el || typeof el.value !== 'string') return ''
  return el.value.trim()
}

export function wire(form, render) {
  const run = () => render()
  form.addEventListener('input', run)
  form.addEventListener('change', run)
  run()
}

export function setResult(root, payload) {
  root.replaceChildren()
  if (payload.hint) {
    const p = document.createElement('p')
    p.className = payload.warn ? 'hint warn' : 'hint'
    p.textContent = payload.hint
    root.append(p)
  }
  const rows = payload.rows || []
  if (!rows.length) return
  const grid = document.createElement('div')
  grid.className = 'results'
  for (const row of rows) {
    const card = document.createElement('div')
    card.className = row.tone ? `result tone-${row.tone}` : 'result'
    const label = document.createElement('span')
    label.textContent = row.label
    const value = document.createElement('b')
    value.textContent = row.value
    card.append(label, value)
    grid.append(card)
  }
  root.append(grid)
}

export function usd(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 'n/a'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(x)
}

export function signedUsd(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 'n/a'
  const abs = usd(Math.abs(x))
  if (x > 0) return `+${abs}`
  if (x < 0) return `-${abs}`
  return abs
}

export function pct(n, digits = 1) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 'n/a'
  return `${x.toFixed(digits)}%`
}

export function americanText(formatAmericanOdds, n) {
  const o = Number(n)
  if (!Number.isFinite(o) || o === 0) return 'n/a'
  return formatAmericanOdds(o)
}
