/**
 * Affiliate tax PDFs:
 * - W-9: official IRS fillable Form W-9 (fw9.pdf) via AcroForm
 * - W-8: substitute attestation PDF (v1)
 * Full TIN is written into the PDF only (private Storage); DB keeps last 4.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fw9Url from './tax-forms/fw9.pdf?url'

const W9 = {
  name: 'topmostSubform[0].Page1[0].f1_01[0]',
  business: 'topmostSubform[0].Page1[0].f1_02[0]',
  llcClass: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_03[0]',
  otherText: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].f1_04[0]',
  exemptPayee: 'topmostSubform[0].Page1[0].f1_05[0]',
  fatca: 'topmostSubform[0].Page1[0].f1_06[0]',
  address: 'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]',
  cityStateZip: 'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]',
  accountNumbers: 'topmostSubform[0].Page1[0].f1_09[0]',
  requester: 'topmostSubform[0].Page1[0].f1_10[0]',
  ssn1: 'topmostSubform[0].Page1[0].f1_11[0]',
  ssn2: 'topmostSubform[0].Page1[0].f1_12[0]',
  ssn3: 'topmostSubform[0].Page1[0].f1_13[0]',
  ein1: 'topmostSubform[0].Page1[0].f1_14[0]',
  ein2: 'topmostSubform[0].Page1[0].f1_15[0]',
  classIndividual: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]',
  classCCorp: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[1]',
  classSCorp: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]',
  classPartnership: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[3]',
  classTrust: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[4]',
  classLlc: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[5]',
  classOther: 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[6]',
}

function line(page, font, text, x, y, size = 10) {
  page.drawText(String(text || ''), {
    x,
    y,
    size,
    font,
    color: rgb(0.1, 0.1, 0.12),
  })
}

function wrapLines(font, text, size, maxWidth) {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function setText(form, name, value) {
  const v = String(value || '').trim()
  if (!v) return
  try {
    form.getTextField(name).setText(v.slice(0, 120))
  } catch {
    // field missing on this revision
  }
}

function check(form, name) {
  try {
    form.getCheckBox(name).check()
  } catch {
    // field missing on this revision
  }
}

/** @param {string} classification */
function applyW9Classification(form, classification) {
  const raw = String(classification || '').trim()
  const s = raw.toLowerCase()

  if (!s || /\b(individual|sole|person|ssn)\b/.test(s)) {
    check(form, W9.classIndividual)
    return 'ssn'
  }
  if (/\bs[\s-]?corp/.test(s)) {
    check(form, W9.classSCorp)
    return 'ein'
  }
  if (/\bc[\s-]?corp|\bcorporation\b/.test(s)) {
    check(form, W9.classCCorp)
    return 'ein'
  }
  if (/\bpartnership\b/.test(s)) {
    check(form, W9.classPartnership)
    return 'ein'
  }
  if (/\btrust\b|\bestate\b/.test(s)) {
    check(form, W9.classTrust)
    return 'ein'
  }
  if (/\bllc\b/.test(s)) {
    check(form, W9.classLlc)
    const llcLetter = (raw.match(/\b([CSP])\b/i) || [])[1]
    if (llcLetter) setText(form, W9.llcClass, llcLetter.toUpperCase())
    return 'ein'
  }
  check(form, W9.classOther)
  setText(form, W9.otherText, raw.slice(0, 40))
  return 'ein'
}

/** @param {string} tinFull @param {'ssn'|'ein'} prefer */
function applyW9Tin(form, tinFull, prefer) {
  const digits = String(tinFull || '').replace(/\D/g, '')
  if (digits.length !== 9) return

  const looksEin =
    prefer === 'ein' ||
    /^\d{2}-\d{7}$/.test(String(tinFull || '').trim()) ||
    /ein/i.test(String(tinFull || ''))

  if (looksEin) {
    setText(form, W9.ein1, digits.slice(0, 2))
    setText(form, W9.ein2, digits.slice(2))
  } else {
    setText(form, W9.ssn1, digits.slice(0, 3))
    setText(form, W9.ssn2, digits.slice(3, 5))
    setText(form, W9.ssn3, digits.slice(5))
  }
}

async function loadOfficialW9Bytes() {
  const res = await fetch(fw9Url)
  if (!res.ok) throw new Error('Could not load official IRS W-9 template.')
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Fill official IRS Form W-9 (current fw9.pdf in tax-forms/).
 * @param {object} input
 */
async function buildOfficialW9Pdf(input) {
  const template = await loadOfficialW9Bytes()
  const pdf = await PDFDocument.load(template, { ignoreEncryption: true })
  const form = pdf.getForm()

  setText(form, W9.name, input.legalName)
  setText(form, W9.business, input.businessName)
  const tinPrefer = applyW9Classification(form, input.taxClassification)
  setText(form, W9.address, input.addressLine1)
  const city = String(input.city || '').trim()
  const region = String(input.region || '').trim()
  const postal = String(input.postalCode || '').trim()
  setText(
    form,
    W9.cityStateZip,
    [city && region ? `${city}, ${region}` : city || region, postal].filter(Boolean).join(' '),
  )
  setText(form, W9.requester, 'EdgeTilt')
  applyW9Tin(form, input.tinFull, tinPrefer)

  // Official W-9 has no AcroForm signature field ... draw typed signature + date on Part II.
  const page = pdf.getPages()[0]
  const font = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica)
  const sig = String(input.signatureName || input.legalName || '').trim()
  const dateStr = (input.attestedAtIso || new Date().toISOString()).slice(0, 10)
  if (sig) {
    page.drawText(sig, { x: 72, y: 118, size: 11, font, color: rgb(0.05, 0.05, 0.08) })
  }
  page.drawText(dateStr, { x: 420, y: 118, size: 10, font: fontReg, color: rgb(0.05, 0.05, 0.08) })

  try {
    form.flatten()
  } catch {
    // some viewers still open unflattened
  }

  const bytes = await pdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

async function buildSubstituteAttestationPdf(input) {
  const formType = input.formType === 'w8' ? 'w8' : 'w9'
  const title =
    formType === 'w9'
      ? 'Substitute Form W-9 ... Taxpayer Identification'
      : 'Substitute Form W-8BEN ... Foreign Status'

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const margin = 48
  const maxWidth = 612 - margin * 2
  let y = 744

  const drawWrapped = (text, size, bold = false) => {
    const f = bold ? fontBold : font
    for (const row of wrapLines(f, text, size, maxWidth)) {
      if (y < 64) return
      line(page, f, row, margin, y, size)
      y -= size + 4
    }
  }

  line(page, fontBold, 'EdgeTilt Affiliate Tax Attestation', margin, y, 16)
  y -= 22
  line(page, fontBold, title, margin, y, 12)
  y -= 18
  drawWrapped(
    'This is a substitute form for EdgeTilt year-end 1099 prep. It is not an IRS e-file submission.',
    9,
  )
  y -= 10

  const rows = [
    ['Form', formType === 'w9' ? 'W-9 (US person)' : 'W-8 (non-US person)'],
    ['Legal name', input.legalName || ''],
    ['Business name', input.businessName || ''],
    ['Classification', input.taxClassification || ''],
    ['Address', input.addressLine1 || ''],
    ['City', input.city || ''],
    ['State / region', input.region || ''],
    ['Postal code', input.postalCode || ''],
    ['Country', input.country || ''],
  ]

  if (input.ftinNotLegallyRequired) {
    rows.push(['TIN / FTIN', 'FTIN not legally required (attested)'])
  } else {
    rows.push(['TIN (SSN / EIN / Foreign-TIN)', input.tinFull || ''])
    rows.push(['TIN last 4', input.tinLast4 || ''])
  }

  for (const [label, value] of rows) {
    line(page, fontBold, `${label}:`, margin, y, 10)
    y -= 14
    drawWrapped(value || '-', 10)
    y -= 6
  }

  y -= 8
  line(page, fontBold, 'Certification', margin, y, 12)
  y -= 18

  const cert =
    'Under penalties of perjury, I declare that I have examined the information on this form and to the best of my knowledge and belief it is true, correct, and complete. I further certify under penalties of perjury that: I am the individual that is the beneficial owner (or am authorized to sign for the beneficial owner) of all the income to which this form relates; the beneficial owner is not a U.S. person; and for FTIN, either a foreign TIN is provided or FTIN is not legally required as attested above.'

  drawWrapped(cert, 9)
  y -= 14

  line(page, fontBold, 'Electronic signature (typed name)', margin, y, 10)
  y -= 16
  drawWrapped(input.signatureName || '', 12, true)
  y -= 8
  drawWrapped(`Signed at (UTC): ${input.attestedAtIso || new Date().toISOString()}`, 9)

  const bytes = await pdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * @param {object} input
 * @param {'w9'|'w8'} input.formType
 * @param {string} input.legalName
 * @param {string} [input.businessName]
 * @param {string} [input.taxClassification]
 * @param {string} [input.addressLine1]
 * @param {string} [input.city]
 * @param {string} [input.region]
 * @param {string} [input.postalCode]
 * @param {string} [input.country]
 * @param {string} [input.tinFull]
 * @param {string} [input.tinLast4]
 * @param {boolean} [input.ftinNotLegallyRequired]
 * @param {string} input.signatureName
 * @param {string} [input.attestedAtIso]
 */
export async function buildAffiliateTaxAttestationPdf(input) {
  if (input.formType === 'w8') {
    return buildSubstituteAttestationPdf({ ...input, formType: 'w8' })
  }
  return buildOfficialW9Pdf(input)
}

export function tinLast4FromFull(tinFull) {
  const digits = String(tinFull || '').replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(-4)
  const raw = String(tinFull || '').trim()
  return raw ? raw.slice(-4) : ''
}
