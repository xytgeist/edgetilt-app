/**
 * Client-side W-2G OCR (tesseract.js) + field heuristics for tax-relevant boxes.
 * Stays on-device; no upload.
 */

/** @typedef {{ key: string, label: string, value: string }} W2GField */

/** Tax-relevant field order for UI + copy. */
export const W2G_FIELD_DEFS = [
  { key: 'payerName', label: "Payer's name" },
  { key: 'payerTin', label: "Payer's TIN" },
  { key: 'payerTelephone', label: "Payer's telephone" },
  { key: 'payerAddress', label: "Payer's address" },
  { key: 'winnerName', label: "Winner's name" },
  { key: 'winnerTin', label: "Winner's TIN" },
  { key: 'winnerAddress', label: "Winner's address" },
  { key: 'reportableWinnings', label: '1 Reportable winnings' },
  { key: 'dateWon', label: '2 Date won' },
  { key: 'typeOfWager', label: '3 Type of wager' },
  { key: 'federalTaxWithheld', label: '4 Federal income tax withheld' },
  { key: 'transaction', label: '5 Transaction' },
  { key: 'identicalWagers', label: '7 Winnings from identical wagers' },
  { key: 'window', label: '10 Window' },
  { key: 'stateWinnings', label: '14 State winnings' },
  { key: 'stateTaxWithheld', label: '15 State income tax withheld' },
]

/** @type {import('tesseract.js').Worker | null} */
let worker = null
/** @type {Promise<import('tesseract.js').Worker> | null} */
let workerPromise = null
/** @type {((pct: number) => void) | null} */
let progressCb = null

async function getOcrWorker() {
  if (worker) return worker
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const w = await createWorker('eng', 1, {
        // Language data loads from CDN once, then browser-cached.
        logger: (m) => {
          if (m?.status === 'recognizing text' && typeof m.progress === 'number') {
            progressCb?.(Math.round(m.progress * 100))
          }
        },
      })
      await w.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
      })
      worker = w
      return w
    })()
  }
  return workerPromise
}

/**
 * @param {string} s
 */
function cleanSpace(s) {
  return String(s || '')
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} s
 */
function normalizeMoney(s) {
  const t = cleanSpace(s).replace(/[^\d.,\-]/g, '')
  if (!t) return ''
  const n = Number(t.replace(/,/g, ''))
  if (!Number.isFinite(n)) return cleanSpace(s)
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/**
 * @param {string} s
 */
function normalizeDate(s) {
  const t = cleanSpace(s).replace(/\s+/g, '')
  const m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (!m) return cleanSpace(s)
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  let yy = m[3]
  if (yy.length === 2) yy = `20${yy}`
  return `${mm}/${dd}/${yy}`
}

/**
 * @param {string} s
 */
function normalizeTin(s) {
  const digits = String(s || '').replace(/\D/g, '')
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`
  // Already masked like XXX-XX-9557
  const masked = cleanSpace(s).match(/[X\d]{3}-[X\d]{2}-[X\d]{4}/i)
  if (masked) return masked[0].toUpperCase()
  const ein = cleanSpace(s).match(/\d{2}-\d{7}/)
  if (ein) return ein[0]
  return cleanSpace(s)
}

/**
 * Grab text after a label on the same line, or next non-empty line.
 * @param {string[]} lines
 * @param {RegExp} labelRe
 * @param {{ maxLookahead?: number }} [opts]
 */
function afterLabel(lines, labelRe, opts = {}) {
  const maxLookahead = opts.maxLookahead ?? 2
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!labelRe.test(line)) continue
    const stripped = cleanSpace(line.replace(labelRe, ' '))
    if (stripped && stripped.length >= 2 && !/^(name|address|no\.?|tin)$/i.test(stripped)) {
      return stripped
    }
    for (let j = 1; j <= maxLookahead; j++) {
      const next = cleanSpace(lines[i + j] || '')
      if (!next) continue
      if (/^(payer|winner|reportable|federal|state|type of|date won|transaction|window)/i.test(next)) {
        break
      }
      return next
    }
  }
  return ''
}

const MONEY_RE = /\$\s*[\d,]*\.\d{2}/
const DATE_RE = /\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}/
const NEXT_BOX_RE = /^\d{1,2}\b/

/**
 * Box N value: line must start with the box number (avoids matching inside $7,500).
 * @param {string[]} lines
 * @param {number|string} box
 */
function boxValue(lines, box) {
  const boxRe = new RegExp(`^\\s*${box}\\b`)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!boxRe.test(line)) continue
    const money = line.match(MONEY_RE)
    if (money) return cleanSpace(money[0])
    const date = line.match(DATE_RE)
    if (date) return cleanSpace(date[0])
    let rest = cleanSpace(
      line
        .replace(boxRe, '')
        .replace(
          /reportable winnings|date won|type of wager|federal income tax withheld|transaction|winnings from identical wagers|window|state winnings|state income tax withheld|winner'?s?\s*taxpayer identification(?:\s*no\.?)?/gi,
          '',
        ),
    )
    // Keep values like "91 PQ" (wager codes); only skip stealing the *next* numbered box line.
    if (rest && rest.length <= 48) return rest
    const next = cleanSpace(lines[i + 1] || '')
    if (!next || NEXT_BOX_RE.test(next)) continue
    const nextMoney = next.match(MONEY_RE)
    if (nextMoney) return cleanSpace(nextMoney[0])
    const nextDate = next.match(DATE_RE)
    if (nextDate) return cleanSpace(nextDate[0])
    if (next.length <= 48) return next
  }
  return ''
}

/**
 * @param {string} rawText
 * @returns {Record<string, string>}
 */
export function parseW2GText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '')
  const lines = text
    .split('\n')
    .map((l) => cleanSpace(l))
    .filter(Boolean)

  const payerName =
    afterLabel(lines, /payer'?s?\s*name[:\s]*/i) ||
    afterLabel(lines, /payer'?s?\s*name,\s*street/i) ||
    ''

  let payerTin = afterLabel(lines, /payer'?s?\s*tin[:\s]*/i)
  if (!payerTin) {
    const ein = text.match(/\b(\d{2}-\d{7})\b/)
    if (ein) payerTin = ein[1]
  }

  const payerTelephone =
    afterLabel(lines, /payer'?s?\s*telephone[^:\n]*[:\s]*/i) ||
    (text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [])[0] ||
    ''

  const payerStreet = afterLabel(lines, /payer'?s?\s*street address[:\s]*/i)
  const payerCity = afterLabel(lines, /city or town[^:\n]*[:\s]*/i, { maxLookahead: 1 })
  // Prefer first city block near payer; keep simple join when street found
  const payerAddress = [payerStreet, payerCity].filter(Boolean).join(', ')

  let winnerName = afterLabel(lines, /winner'?s?\s*name[:\s]*/i)
  // Strip leading account numbers often printed above the name
  if (winnerName) {
    winnerName = cleanSpace(winnerName.replace(/^\d{5,}\s+/, ''))
  }

  let winnerTin =
    afterLabel(lines, /winner'?s?\s*taxpayer identification[^:\n]*[:\s]*/i) ||
    boxValue(lines, 9)
  if (!winnerTin || NEXT_BOX_RE.test(winnerTin) || /window/i.test(winnerTin)) {
    const ssn = text.match(/\b(?:XXX|\d{3})-(?:XX|\d{2})-\d{4}\b/i)
    if (ssn) winnerTin = ssn[0]
  }

  const winnerStreet = afterLabel(lines, /winner'?s?\s*street address[:\s]*/i)
  const winnerApt = afterLabel(lines, /apt\.?\s*no\.?[:\s]*/i)
  const winnerAddress = [winnerStreet, winnerApt].filter(Boolean).join(', ')

  const reportableWinnings = boxValue(lines, 1)
  const dateWon = boxValue(lines, 2)
  const typeOfWager = boxValue(lines, 3)
  const federalTaxWithheld = boxValue(lines, 4)
  const transaction = boxValue(lines, 5)
  const identicalWagers = boxValue(lines, 7)
  const window = boxValue(lines, 10)
  const stateWinnings = boxValue(lines, 14)
  const stateTaxWithheld = boxValue(lines, 15)

  return {
    payerName: cleanSpace(payerName),
    payerTin: normalizeTin(payerTin),
    payerTelephone: cleanSpace(payerTelephone),
    payerAddress: cleanSpace(payerAddress),
    winnerName: cleanSpace(winnerName),
    winnerTin: normalizeTin(winnerTin),
    winnerAddress: cleanSpace(winnerAddress),
    reportableWinnings: reportableWinnings ? normalizeMoney(reportableWinnings) : '',
    dateWon: dateWon ? normalizeDate(dateWon) : '',
    typeOfWager: cleanSpace(typeOfWager),
    federalTaxWithheld: federalTaxWithheld ? normalizeMoney(federalTaxWithheld) : '',
    transaction: cleanSpace(transaction),
    identicalWagers: cleanSpace(identicalWagers),
    window: cleanSpace(window),
    stateWinnings: stateWinnings ? normalizeMoney(stateWinnings) : '',
    stateTaxWithheld: stateTaxWithheld ? normalizeMoney(stateTaxWithheld) : '',
  }
}

/**
 * @param {Record<string, string>} fields
 * @returns {W2GField[]}
 */
export function fieldsToList(fields) {
  return W2G_FIELD_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    value: fields?.[d.key] || '',
  }))
}

/**
 * @param {W2GField[]} list
 */
export function formatFieldsForCopy(list) {
  return list
    .filter((f) => f.value)
    .map((f) => `${f.label}: ${f.value}`)
    .join('\n')
}

/**
 * @param {HTMLCanvasElement | HTMLImageElement | string} image
 * @param {{ onProgress?: (pct: number) => void }} [opts]
 * @returns {Promise<{ fields: Record<string, string>, rawText: string, confidence: number | null }>}
 */
export async function ocrW2G(image, opts = {}) {
  const w = await getOcrWorker()
  progressCb = typeof opts.onProgress === 'function' ? opts.onProgress : null
  try {
    const result = await w.recognize(image)
    const rawText = result?.data?.text || ''
    const confidence = typeof result?.data?.confidence === 'number' ? result.data.confidence : null
    const fields = parseW2GText(rawText)
    return { fields, rawText, confidence }
  } finally {
    progressCb = null
  }
}
