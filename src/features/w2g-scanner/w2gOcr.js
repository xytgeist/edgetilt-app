/**
 * Client-side W-2G OCR (tesseract.js) + scavenger parser for TurboTax-combine fields only.
 * On-device OCR; archive upload is separate (w2gArchiveApi).
 */

/** @typedef {{ key: string, label: string, value: string }} W2GField */

/** Six fields needed to combine W-2Gs for taxes. */
export const W2G_FIELD_DEFS = [
  { key: 'payerName', label: "Payer's name" },
  { key: 'payerAddress', label: "Payer's address" },
  { key: 'payerEin', label: "Payer's EIN" },
  { key: 'box1Winnings', label: 'Box 1 – Reportable winnings' },
  { key: 'box4FederalWithheld', label: 'Box 4 – Federal income tax withheld' },
  { key: 'dateWon', label: 'Date' },
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
  const m = raw.match(/\$?\s*([\d,]*)\.(\d{2})/)
  if (!m) return raw
  const whole = (m[1] || '0').replace(/,/g, '') || '0'
  const n = Number(`${whole}.${m[2]}`)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/**
 * Parse currency display / raw OCR into a number for DB storage.
 * @param {string | number | null | undefined} s
 * @returns {number}
 */
export function parseMoneyToNumber(s) {
  if (typeof s === 'number' && Number.isFinite(s)) return s
  const raw = String(s || '').replace(/[^\d.-]/g, '')
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {string} s
 * @param {{ allowTwoDigitYear?: boolean }} [opts]
 */
function normalizeDate(s, opts = {}) {
  const t = cleanSpace(s).replace(/\s+/g, '')
  const m = t.match(/(\d{1,2})[/\-|.|¦](\d{1,2})[/\-|.|¦](\d{2,4})/)
  if (!m) return cleanSpace(s)
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  let yy = m[3]
  if (yy.length === 2) {
    const n = Number(yy)
    if (!opts.allowTwoDigitYear || n < 20 || n > 39) return ''
    yy = `20${yy}`
  }
  return `${mm}/${dd}/${yy}`
}

/**
 * UI date (MM/DD/YYYY) or ISO → YYYY-MM-DD for Postgres date.
 * @param {string | null | undefined} s
 * @returns {string | null}
 */
export function parseDateToIso(s) {
  const t = cleanSpace(s)
  if (!t) return null
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return t
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return null
  let yy = m[3]
  if (yy.length === 2) yy = `20${yy}`
  const mm = m[1].padStart(2, '0')
  const dd = m[2].padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * @param {string | null | undefined} isoOrUi
 * @returns {number}
 */
export function taxYearFromDate(isoOrUi) {
  const iso = parseDateToIso(isoOrUi)
  if (iso) return Number(iso.slice(0, 4))
  return new Date().getFullYear()
}

/**
 * @param {string} s
 */
function normalizeEin(s) {
  const spaced = cleanSpace(s).replace(/\s+/g, '')
  const einLoose = cleanSpace(s).match(/(\d)\s*(\d)\s*-\s*(\d{7})/)
  if (einLoose) return `${einLoose[1]}${einLoose[2]}-${einLoose[3]}`
  const ein = spaced.match(/(\d{2})-(\d{7})/)
  if (ein) return `${ein[1]}-${ein[2]}`
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

  const einMatch =
    text.match(/\b(\d{2})\s*-\s*(\d{7})\b/) || text.match(/\b(\d)\s+(\d)\s*-\s*(\d{7})\b/)
  const payerEin = einMatch ? normalizeEin(einMatch[0]) : ''

  const moneyMatches = [...text.matchAll(/\$\s*[\d,]*\.\d{2}/g)].map((m) => m[0])
  const moneyValues = moneyMatches.map((m) => {
    const parts = m.replace(/[^\d.]/g, '').match(/^(\d*)\.(\d{2})$/)
    if (!parts) return { raw: m, n: 0 }
    return { raw: m, n: Number(`${parts[1] || '0'}.${parts[2]}`) }
  })

  let box1Winnings = ''
  if (moneyValues.length) {
    const best = moneyValues.reduce((a, b) => (b.n > a.n ? b : a), moneyValues[0])
    box1Winnings = normalizeMoney(best.raw)
  }

  let box4FederalWithheld = ''
  const fedLine = lines.find((l) => /federal|withheld/i.test(l) && /\$\s*[\d,]*\.\d{2}/.test(l))
  if (fedLine) {
    const m = fedLine.match(/\$\s*[\d,]*\.\d{2}/)
    if (m) box4FederalWithheld = normalizeMoney(m[0])
  } else {
    const zeroish = moneyValues.find((m) => m.n === 0)
    if (zeroish) box4FederalWithheld = normalizeMoney(zeroish.raw)
  }

  let dateWon = ''
  const dateNear = text.match(/date\s*won[^\d]{0,24}(\d{1,2}\s*[/\-|.]\s*\d{1,2}\s*[/\-|.]\s*\d{2,4})/i)
  if (dateNear) dateWon = normalizeDate(dateNear[1], { allowTwoDigitYear: true })
  if (!dateWon) {
    for (const line of lines) {
      if (/\bDOB\b/i.test(line)) continue
      const dm = line.match(/\b(\d{1,2}\s*[/\-|.]\s*\d{1,2}\s*[/\-|.]\s*\d{2,4})\b/)
      if (!dm) continue
      const norm = normalizeDate(dm[1], { allowTwoDigitYear: true })
      if (norm) {
        dateWon = norm
        break
      }
    }
  }

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

  return {
    payerName: cleanSpace(payerName),
    payerAddress: cleanSpace(payerAddress),
    payerEin: payerEin,
    box1Winnings,
    box4FederalWithheld,
    dateWon,
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
 * TurboTax-style combine summary for one EIN group.
 * @param {{
 *   payerName: string,
 *   payerAddress: string,
 *   payerEin: string,
 *   box1Sum: number,
 *   box4Sum: number,
 *   dateWon: string | null,
 *   slipCount: number,
 * }} group
 */
export function formatCombineSummary(group) {
  const money = (n) =>
    Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return [
    `Payer's name: ${group.payerName || ''}`,
    `Payer's address: ${group.payerAddress || ''}`,
    `Payer's EIN: ${group.payerEin || ''}`,
    `Box 1 – Reportable winnings: ${money(group.box1Sum)}`,
    `Box 4 – Federal income tax withheld: ${money(group.box4Sum)}`,
    `Date: ${group.dateWon || ''}`,
    `(${group.slipCount} slip${group.slipCount === 1 ? '' : 's'} combined)`,
  ].join('\n')
}

/**
 * @param {HTMLCanvasElement | HTMLImageElement | string} image
 * @param {{ onProgress?: (pct: number) => void }} [opts]
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
