/**
 * Strip commas and invalid chars from a money input string.
 * @param {string | number | null | undefined} raw
 * @param {{ allowNegative?: boolean }} [opts]
 */
export function cleanMoneyInputRaw(raw, { allowNegative = false } = {}) {
  if (raw == null) return ''
  let s = String(raw).replace(/,/g, '')
  if (allowNegative) {
    s = s.replace(/[^0-9.\-]/g, '').replace(/(?!^)-/g, '')
  } else {
    s = s.replace(/[^0-9.]/g, '')
  }
  const dotIdx = s.indexOf('.')
  if (dotIdx !== -1) {
    s = s.slice(0, dotIdx + 1) + s.slice(dotIdx + 1).replace(/\./g, '')
  }
  return s
}

/**
 * Format a money input for display while typing (adds thousands commas).
 * @param {string | number | null | undefined} raw
 * @param {{ allowNegative?: boolean }} [opts]
 */
export function formatMoneyInputValue(raw, { allowNegative = false } = {}) {
  const cleaned = cleanMoneyInputRaw(raw, { allowNegative })
  if (cleaned === '' || cleaned === '-') return cleaned

  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const dotIdx = unsigned.indexOf('.')
  const intPart = dotIdx === -1 ? unsigned : unsigned.slice(0, dotIdx)
  const decPart = dotIdx === -1 ? undefined : unsigned.slice(dotIdx + 1)
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  let result = decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted
  if (negative) result = `-${result}`
  return result
}

/**
 * Parse a formatted money input to a number.
 * @param {string | number | null | undefined} value
 */
export function parseMoneyInputNumber(value) {
  const cleaned = cleanMoneyInputRaw(value, { allowNegative: true })
  if (cleaned === '' || cleaned === '-') return NaN
  return Number(cleaned)
}
