/**
 * Client-side W-2G OCR (tesseract.js) + scavenger field parser for tax-relevant boxes.
 * Stays on-device; no upload.
 *
 * Lesson from Ryan's screen recording: label-following parsers hallucinate on noisy
 * tesseract lines. Prefer global regex scavengers + garbage filters, and OCR with PSM 6.
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
        logger: (m) => {
          if (m?.status === 'recognizing text' && typeof m.progress === 'number') {
            progressCb?.(Math.round(m.progress * 100))
          }
        },
      })
      // SINGLE_BLOCK crushes AUTO on dense W-2G grids (verified on Ryan's Paris slip).
      await w.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      })
      worker = w
      return w
    })()
  }
  return workerPromise
}

/**
 * Upscale + mild grayscale contrast for tesseract (canvas-only, no harsh flatten).
 * @param {HTMLCanvasElement} source
 * @returns {HTMLCanvasElement}
 */
export function prepCanvasForOcr(source) {
  const srcW = source.width
  const srcH = source.height
  if (!(srcW > 0 && srcH > 0)) return source

  const targetW = Math.max(srcW, 2000)
  const scale = targetW / srcW
  const w = Math.round(srcW * scale)
  const h = Math.round(srcH * scale)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return source
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = 'grayscale(1) contrast(1.18) brightness(1.04)'
  ctx.drawImage(source, 0, 0, w, h)
  ctx.filter = 'none'
  return out
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
  const raw = cleanSpace(s)
  if (!raw) return ''
  // "$ .00" / "$.00" / "$ 7,500.00"
  const m = raw.match(/\$?\s*([\d,]*)\.(\d{2})/)
  if (!m) return raw
  const whole = (m[1] || '0').replace(/,/g, '') || '0'
  const n = Number(`${whole}.${m[2]}`)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/**
 * @param {string} s
 * @param {{ allowTwoDigitYear?: boolean }} [opts]
 */
function normalizeDate(s, opts = {}) {
  const t = cleanSpace(s).replace(/\s+/g, '')
  const m = t.match(/(\d{1,2})[\/\-|.|¦](\d{1,2})[\/\-|.|¦](\d{2,4})/)
  if (!m) return cleanSpace(s)
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  let yy = m[3]
  if (yy.length === 2) {
    const n = Number(yy)
    // Reject DOB-like years (e.g. 80 → 2080). Casino W-2Gs are recent.
    if (!opts.allowTwoDigitYear || n < 20 || n > 39) return ''
    yy = `20${yy}`
  }
  return `${mm}/${dd}/${yy}`
}

/**
 * @param {string} s
 */
function normalizeTin(s) {
  const spaced = cleanSpace(s).replace(/\s+/g, '')
  // EIN with OCR split: "2 5-2258774" / "26-2258774"
  const einLoose = cleanSpace(s).match(/(\d)\s*(\d)\s*-\s*(\d{7})/)
  if (einLoose) return `${einLoose[1]}${einLoose[2]}-${einLoose[3]}`
  const ein = spaced.match(/(\d{2})-(\d{7})/)
  if (ein) return `${ein[1]}-${ein[2]}`
  const ssn = spaced.match(/((?:XXX|\d{3})-(?:XX|\d{2})-\d{4})/i)
  if (ssn) return ssn[1].toUpperCase()
  return cleanSpace(s)
}

/**
 * @param {string} s
 */
function looksLikeGarbageName(s) {
  const t = cleanSpace(s)
  if (!t) return true
  if (/omb\s*no|taxpayer identification|winner'?s?|payer'?s?|reportable|form\s*w-?2g|corrected|window|signature|penalties/i.test(t)) {
    return true
  }
  if (/^\d+$/.test(t)) return true
  if (t.length < 4) return true
  return false
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

  // --- global scavengers (order-independent) ---
  const einMatch =
    text.match(/\b(\d{2})\s*-\s*(\d{7})\b/) || text.match(/\b(\d)\s+(\d)\s*-\s*(\d{7})\b/)
  const payerTin = einMatch
    ? normalizeTin(einMatch[0])
    : ''

  const phoneMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
  const payerTelephone = phoneMatch ? cleanSpace(phoneMatch[0]).replace(/(\d{3})[.-](\d{3})[.-](\d{4})/, '($1) $2-$3') : ''

  const ssnMatches = [...text.matchAll(/\b(?:XXX|\d{3})\s*-\s*(?:XX|\d{2})\s*-\s*\d{4}\b/gi)].map((m) =>
    normalizeTin(m[0]),
  )
  const winnerTin = ssnMatches[0] || ''

  const moneyMatches = [...text.matchAll(/\$\s*[\d,]*\.\d{2}/g)].map((m) => m[0])
  const moneyValues = moneyMatches.map((m) => {
    const parts = m.replace(/[^\d.]/g, '').match(/^(\d*)\.(\d{2})$/)
    if (!parts) return { raw: m, n: 0 }
    return { raw: m, n: Number(`${parts[1] || '0'}.${parts[2]}`) }
  })
  // Reportable winnings = largest dollar amount on the slip (usually box 1).
  let reportableWinnings = ''
  if (moneyValues.length) {
    const best = moneyValues.reduce((a, b) => (b.n > a.n ? b : a), moneyValues[0])
    reportableWinnings = normalizeMoney(best.raw)
  }
  // Federal withheld often $0.00; prefer an amount near "federal" else second $0-ish / last small.
  let federalTaxWithheld = ''
  const fedLine = lines.find((l) => /federal|withheld/i.test(l) && /\$\s*[\d,]*\.\d{2}/.test(l))
  if (fedLine) {
    const m = fedLine.match(/\$\s*[\d,]*\.\d{2}/)
    if (m) federalTaxWithheld = normalizeMoney(m[0])
  } else {
    const zeroish = moneyValues.find((m) => m.n === 0)
    if (zeroish) federalTaxWithheld = normalizeMoney(zeroish.raw)
  }

  let stateWinnings = ''
  let stateTaxWithheld = ''
  const stateWinLine = lines.find((l) => /state winnings/i.test(l))
  if (stateWinLine) {
    const m = stateWinLine.match(/\$\s*[\d,]*\.\d{2}/)
    if (m) stateWinnings = normalizeMoney(m[0])
  }
  const stateTaxLine = lines.find((l) => /state income tax/i.test(l))
  if (stateTaxLine) {
    const m = stateTaxLine.match(/\$\s*[\d,]*\.\d{2}/)
    if (m) stateTaxWithheld = normalizeMoney(m[0])
  }
  // If still empty and we have multiple $0.00, leave blank rather than invent.

  // Date won: prefer explicit "date won", never DOB lines.
  let dateWon = ''
  const dateNear = text.match(/date\s*won[^\d]{0,24}(\d{1,2}\s*[\/\-|.]\s*\d{1,2}\s*[\/\-|.]\s*\d{2,4})/i)
  if (dateNear) dateWon = normalizeDate(dateNear[1], { allowTwoDigitYear: true })
  if (!dateWon) {
    for (const line of lines) {
      if (/\bDOB\b/i.test(line)) continue
      const dm = line.match(/\b(\d{1,2}\s*[\/\-|.]\s*\d{1,2}\s*[\/\-|.]\s*\d{2,4})\b/)
      if (!dm) continue
      const norm = normalizeDate(dm[1], { allowTwoDigitYear: true })
      if (norm) {
        dateWon = norm
        break
      }
    }
  }

  // Type of wager: "91 PQ" / "91 PO" style codes
  let typeOfWager = ''
  const wagerMatch = text.match(/\b(\d{2})\s*([A-Z]{1,3})\b/)
  // Prefer near "type of wager" or known pattern not zip
  const wagerNear = text.match(/type of wager[^\n]{0,40}?(\d{2}\s*[A-Z]{1,3})/i)
  if (wagerNear) typeOfWager = cleanSpace(wagerNear[1])
  else if (wagerMatch && !/89109|890|891/.test(wagerMatch[0])) {
    // Avoid matching zip fragments; require letter suffix length 2-3 common for casino codes
    if (wagerMatch[2].length >= 2) typeOfWager = `${wagerMatch[1]} ${wagerMatch[2]}`
  }

  // Transaction codes like EV82
  let transaction = ''
  const txnNear = text.match(/transaction[^\n]{0,30}?\b([A-Z]{1,3}\d{2,})\b/i)
  if (txnNear) transaction = txnNear[1].toUpperCase()
  else {
    const txn = text.match(/\b(EV\d{2,}|[A-Z]{2}\d{2,})\b/)
    if (txn && !/OMB|IRS|US|NV|XX/i.test(txn[1])) transaction = txn[1].toUpperCase()
  }

  let window = ''
  if (/\bMAIN\s*CAGE\b/i.test(text)) window = 'MAIN CAGE'
  else {
    const winNear = text.match(/window[^\n]{0,40}?([A-Z][A-Z0-9 /-]{2,20})/i)
    if (winNear && !/taxpayer|identification|omb/i.test(winNear[1])) window = cleanSpace(winNear[1])
  }

  let identicalWagers = ''
  if (/\bN\s*\/\s*A\b/i.test(text) && /identical/i.test(text)) identicalWagers = 'N/A'

  // Payer name: company line + optional D/B/A line (strip trailing box noise).
  let payerName = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/OPERATING COMPANY|D\/B\/A/i.test(line)) continue
    const company = line.match(/([A-Z][A-Z0-9 &.',-]{3,}OPERATING COMPANY)/i)
    let name = company ? company[1] : ''
    const dbaSame = line.match(/D\/B\/A\s+[A-Z0-9 &.',-]{3,60}/i)
    let dba = dbaSame ? cleanSpace(dbaSame[0]) : ''
    if (!dba) {
      const next = lines[i + 1] || ''
      const dbaNext = next.match(/D\/B\/A\s+[A-Z0-9 &.',-]{3,60}/i)
      if (dbaNext) dba = cleanSpace(dbaNext[0].replace(/\$.*$/, '').replace(/\d\s*Reportable.*$/i, ''))
    } else {
      dba = dba.replace(/\$.*$/, '').replace(/\d\s*Reportable.*$/i, '')
    }
    name = cleanSpace([name, dba].filter(Boolean).join(', '))
    if (!looksLikeGarbageName(name) && name.length >= 8) {
      payerName = name
      break
    }
  }

  // Payer address: first street that isn't the winner's (2700…), plus LV/NV/zip.
  let payerAddress = ''
  const payerStreet = lines.find(
    (l) =>
      /\d{2,5}\s+.*\b(BLVD|STREET|ST\.?|AVE|ROAD|RD|DRIVE|DR)\b/i.test(l) &&
      !/2700/.test(l) &&
      !/APT/i.test(l),
  )
  if (payerStreet) {
    const street = cleanSpace(
      (payerStreet.match(/(\d{2,5}\s+.*?\b(?:BLVD|STREET|ST\.?|AVE|ROAD|RD|DRIVE|DR)\b(?:\s+[A-Z]+)?)/i) || [])[1] ||
        payerStreet,
    )
      .replace(/\b\d\s*Race\b.*$/i, '')
      .replace(/\$\s*[\d,]*\.\d{2}.*$/i, '')
    const zip = (text.match(/\b(89\d{3})\b/) || [])[1] || ''
    payerAddress = cleanSpace([street, zip ? `LAS VEGAS, NV ${zip}` : 'LAS VEGAS, NV'].filter(Boolean).join(', '))
  }

  // Winner name: leading First Last on a line (ignore trailing instructional OCR).
  let winnerName = ''
  for (const line of lines) {
    const m = line.match(/^([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b/)
    if (!m) continue
    const name = m[1]
    if (
      /\b(LAS VEGAS|PARIS|OPERATING|COMPANY|MAIN CAGE|FORM|COPY|STREET|BLVD|SOUTH|CORRECTED|CERTAIN|GAMBLING|WINNINGS|REPORTABLE|WINDOW|REQUIRED|RETURN|PENALTY)\b/.test(
        name,
      )
    ) {
      continue
    }
    if (looksLikeGarbageName(name)) continue
    winnerName = name
    break
  }
  if (!winnerName) {
    const m = text.match(/\b\d{5,}\s+([A-Z]{2,}\s+[A-Z]{2,})\b/)
    if (m && !looksLikeGarbageName(m[1])) winnerName = m[1]
  }

  // Winner address: prefer APT / 2700 pattern (tight street match… avoid OCR junk tails).
  let winnerAddress = ''
  const winStreetHit = text.match(/(2700\s+LAS VEGAS BLVD(?:\s+S(?:OUTH)?)?)/i)
  if (winStreetHit) {
    const apt = (text.match(/APT\.?\s*\d+/i) || [])[0] || ''
    const zip = (text.match(/\b(89109\d{0,4})\b/) || [])[1] || ''
    winnerAddress = cleanSpace(
      [winStreetHit[1], apt, zip ? `LAS VEGAS, NV ${zip}` : 'LAS VEGAS, NV'].filter(Boolean).join(', '),
    )
  }

  return {
    payerName: cleanSpace(payerName),
    payerTin,
    payerTelephone: cleanSpace(payerTelephone),
    payerAddress: cleanSpace(payerAddress),
    winnerName: cleanSpace(winnerName),
    winnerTin,
    winnerAddress: cleanSpace(winnerAddress),
    reportableWinnings,
    dateWon,
    typeOfWager: cleanSpace(typeOfWager),
    federalTaxWithheld,
    transaction: cleanSpace(transaction),
    identicalWagers: cleanSpace(identicalWagers),
    window: cleanSpace(window),
    stateWinnings,
    stateTaxWithheld,
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
    let source = image
    if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
      source = prepCanvasForOcr(image)
    }
    const result = await w.recognize(source)
    const rawText = result?.data?.text || ''
    const confidence = typeof result?.data?.confidence === 'number' ? result.data.confidence : null
    const fields = parseW2GText(rawText)
    return { fields, rawText, confidence }
  } finally {
    progressCb = null
  }
}
