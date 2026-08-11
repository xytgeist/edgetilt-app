/**
 * Headless bulk import: crop + OCR one W-2G image for archive save (no corner UI).
 */

import {
  autoScanDocument,
  loadImageCanvasFromFile,
  flattenCroppedDocument,
  presentPrettyScan,
} from './w2gScanPipeline.js'
import { ocrW2G } from './w2gOcr.js'

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
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{
 *   ok: true,
 *   fileName: string,
 *   fields: Record<string, string>,
 *   imageBlob: Blob,
 *   ocrConfidence: number | null,
 * } | {
 *   ok: false,
 *   fileName: string,
 *   error: string,
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

  try {
    if (!file || !String(file.type || '').startsWith('image/')) {
      return { ok: false, fileName, error: 'Not an image file.' }
    }
    throwIfAborted()
    const source = await loadImageCanvasFromFile(file)
    throwIfAborted()
    const { result } = await autoScanDocument(source)
    throwIfAborted()
    if (!result?.success || !result.output) {
      return {
        ok: false,
        fileName,
        error: 'Could not find form corners. Import that slip with a single scan and Adjust.',
      }
    }
    const flat = await flattenCroppedDocument(/** @type {HTMLCanvasElement} */ (result.output))
    throwIfAborted()
    const pretty = presentPrettyScan(flat)
    throwIfAborted()
    const { fields, confidence } = await ocrW2G(flat)
    throwIfAborted()
    const imageBlob = await canvasToJpegBlob(pretty)
    return {
      ok: true,
      fileName,
      fields: fields || {},
      imageBlob,
      ocrConfidence: confidence ?? null,
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return { ok: false, fileName, error: err?.message || 'Import failed.' }
  }
}
