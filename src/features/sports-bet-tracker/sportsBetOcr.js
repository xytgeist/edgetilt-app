import { canRecognizeEdgeText, recognizeEdgeText } from '../../utils/edgeNative.js'

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.onload = () => {
      const s = String(reader.result || '')
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.readAsDataURL(blob)
  })
}

/** On-device Vision OCR when the IPA has it. PWA returns null so the user can paste instead. */
export async function ocrSportsBetSlipImage(file) {
  if (!file || !canRecognizeEdgeText()) return { text: '', error: null, native: false }
  try {
    const imageBase64 = await blobToBase64(file)
    const result = await recognizeEdgeText({
      imageBase64,
      mimeType: file.type || 'image/jpeg',
      purpose: 'sports-bet-slip',
    })
    if (result?.ok === false) {
      return { text: '', error: String(result.error || 'OCR failed'), native: true }
    }
    const text = String(result?.text || '').trim()
    return { text, error: text ? null : 'No text on that photo', native: true }
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : 'OCR failed', native: true }
  }
}
