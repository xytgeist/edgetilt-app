/**
 * Client-side substitute W-9 / W-8 attestation PDF for affiliate tax profiles.
 * Full TIN is written into the PDF only (uploaded to private Storage); DB keeps last 4.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

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
    drawWrapped(value || '—', 10)
    y -= 6
  }

  y -= 8
  line(page, fontBold, 'Certification', margin, y, 12)
  y -= 18

  const cert =
    formType === 'w9'
      ? 'Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); (2) I am not subject to backup withholding; (3) I am a U.S. citizen or other U.S. person; and (4) The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.'
      : 'Under penalties of perjury, I declare that I have examined the information on this form and to the best of my knowledge and belief it is true, correct, and complete. I further certify under penalties of perjury that: I am the individual that is the beneficial owner (or am authorized to sign for the beneficial owner) of all the income to which this form relates; the beneficial owner is not a U.S. person; and for FTIN, either a foreign TIN is provided or FTIN is not legally required as attested above.'

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

export function tinLast4FromFull(tinFull) {
  const digits = String(tinFull || '').replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(-4)
  const raw = String(tinFull || '').trim()
  return raw ? raw.slice(-4) : ''
}
