/**
 * Cloud vision extract for W-2G six fields (Edge w2g-vision-extract).
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ maxEdge?: number, quality?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function canvasToVisionJpegBlob(canvas, opts = {}) {
  const maxEdge = opts.maxEdge ?? 1600
  const quality = opts.quality ?? 0.85
  const srcW = canvas.width
  const srcH = canvas.height
  if (!(srcW > 0 && srcH > 0)) throw new Error('Empty scan canvas.')

  let out = canvas
  const longEdge = Math.max(srcW, srcH)
  if (longEdge > maxEdge) {
    const scale = maxEdge / longEdge
    const w = Math.max(1, Math.round(srcW * scale))
    const h = Math.max(1, Math.round(srcH * scale))
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, w, h)
    out = tmp
  }

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode image for AI extract.'))
        else resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   imageBlob: Blob,
 * }} args
 * @returns {Promise<{ fields: Record<string, string>, confidence: number | null, engine: string }>}
 */
export async function extractW2GFieldsWithVision({ supabase, imageBlob }) {
  if (!supabase) throw new Error('Supabase client missing')
  if (!imageBlob) throw new Error('Missing slip image')

  const imageBase64 = await blobToBase64(imageBlob)
  const mimeType = imageBlob.type || 'image/jpeg'

  const { data, error, response } = await supabase.functions.invoke('w2g-vision-extract', {
    body: { imageBase64, mimeType },
  })

  if (error) {
    let detail = error.message || 'AI extract failed.'
    try {
      const body = data && typeof data === 'object' ? data : await response?.json?.()
      if (body?.error) detail = String(body.error)
      if (body?.code) {
        const err = new Error(detail)
        err.code = body.code
        throw err
      }
    } catch (e) {
      if (e?.code) throw e
    }
    const err = new Error(detail)
    throw err
  }

  if (data?.error) {
    const err = new Error(String(data.error))
    if (data.code) err.code = data.code
    throw err
  }

  const fields = data?.fields && typeof data.fields === 'object' ? data.fields : null
  if (!fields) throw new Error('AI extract returned no fields.')

  return {
    fields: {
      payerName: String(fields.payerName || ''),
      payerAddress: String(fields.payerAddress || ''),
      payerEin: String(fields.payerEin || ''),
      box1Winnings: String(fields.box1Winnings || ''),
      box4FederalWithheld: String(fields.box4FederalWithheld || ''),
      dateWon: String(fields.dateWon || ''),
    },
    confidence:
      typeof data.confidence === 'number' && Number.isFinite(data.confidence)
        ? Math.round(data.confidence * 100)
        : null,
    engine: String(data.engine || 'openai-vision'),
  }
}
