/**
 * Headless bulk import: crop + OCR/vision one W-2G image for archive save (no corner UI).
 * Corner failures still return the original image so the archive can keep an ATTN slip.
 */

import {
  autoScanDocument,
  loadImageCanvasFromFile,
  flattenCroppedDocument,
  presentPrettyScan,
} from './w2gScanPipeline.js'
import { ocrW2G } from './w2gOcr.js'
import { canvasToVisionJpegBlob, extractW2GFieldsWithVision } from './w2gVisionApi.js'

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
function canvasToJpegBlob(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode slip image.'))
        else resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

/**
 * @param {File} file
 * @param {{
 *   signal?: AbortSignal,
 *   supabase?: import('@supabase/supabase-js').SupabaseClient | null,
 *   useVision?: boolean,
 * }} [opts]
 * @returns {Promise<{
 *   ok: true,
 *   fileName: string,
 *   fields: Record<string, string>,
 *   imageBlob: Blob,
 *   ocrConfidence: number | null,
 *   needsAttention?: false,
 * } | {
 *   ok: false,
 *   fileName: string,
 *   error: string,
 *   needsAttention?: boolean,
 *   imageBlob?: Blob | null,
 *   fields?: Record<string, string>,
 *   ocrConfidence?: number | null,
 * }>}
 */
export async function processW2GImageForArchive(file, opts = {}) {
  const fileName = file?.name || 'image'
  const signal = opts.signal
  const throwIfAborted = () => {
    if (signal?.aborted) {
      const err = new Error('Bulk import cancelled.')
      err.name = 'AbortError'
      throw err
    }
  }

  /** @type {Blob | null} */
  let fallbackBlob = file && String(file.type || '').startsWith('image/') ? file : null

  try {
    if (!file || !String(file.type || '').startsWith('image/')) {
      return { ok: false, fileName, error: 'Not an image file.', needsAttention: false, imageBlob: null }
    }
    throwIfAborted()
    const source = await loadImageCanvasFromFile(file)
    throwIfAborted()
    try {
      fallbackBlob = await canvasToJpegBlob(source, 0.88)
    } catch {
      fallbackBlob = file
    }

    const { result } = await autoScanDocument(source)
    throwIfAborted()
    if (!result?.success || !result.output) {
      return {
        ok: false,
        needsAttention: true,
        fileName,
        error:
          "Couldn't lock form corners. Drag the handles onto each corner of the W-2G, then Apply.",
        imageBlob: fallbackBlob,
        fields: {},
        ocrConfidence: null,
      }
    }
    const flat = await flattenCroppedDocument(/** @type {HTMLCanvasElement} */ (result.output))
    throwIfAborted()
    const pretty = presentPrettyScan(flat)
    throwIfAborted()

    /** @type {Record<string, string>} */
    let fields = {}
    /** @type {number | null} */
    let confidence = null

    if (opts.useVision && opts.supabase) {
      try {
        const visionBlob = await canvasToVisionJpegBlob(flat)
        throwIfAborted()
        const vision = await extractW2GFieldsWithVision({
          supabase: opts.supabase,
          imageBlob: visionBlob,
        })
        throwIfAborted()
        fields = vision.fields || {}
        confidence = vision.confidence ?? null
      } catch (visionErr) {
        if (visionErr?.name === 'AbortError') throw visionErr
        const local = await ocrW2G(flat)
        throwIfAborted()
        fields = local.fields || {}
        confidence = local.confidence ?? null
      }
    } else {
      const local = await ocrW2G(flat)
      throwIfAborted()
      fields = local.fields || {}
      confidence = local.confidence ?? null
    }

    const imageBlob = await canvasToJpegBlob(pretty)
    return {
      ok: true,
      fileName,
      fields,
      imageBlob,
      ocrConfidence: confidence,
      needsAttention: false,
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return {
      ok: false,
      needsAttention: Boolean(fallbackBlob),
      fileName,
      error: err?.message || 'Import failed.',
      imageBlob: fallbackBlob,
      fields: {},
      ocrConfidence: null,
    }
  }
}
