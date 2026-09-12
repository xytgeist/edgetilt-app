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
import { extractW2GFields } from './w2gExtract.js'

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
 *   skipDetect?: boolean,
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

    if (opts.skipDetect) {
      const flat = await flattenCroppedDocument(source)
      throwIfAborted()
      const pretty = presentPrettyScan(flat)
      throwIfAborted()
      const extracted = await extractW2GFields(flat, {
        supabase: opts.supabase,
        signal,
      })
      throwIfAborted()
      return {
        ok: true,
        fileName,
        fields: extracted.fields || {},
        imageBlob: await canvasToJpegBlob(pretty),
        ocrConfidence: extracted.confidence ?? null,
        needsAttention: false,
      }
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

    const extracted = await extractW2GFields(flat, {
      supabase: opts.supabase,
      signal,
    })
    throwIfAborted()
    const fields = extracted.fields || {}
    const confidence = extracted.confidence ?? null

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
