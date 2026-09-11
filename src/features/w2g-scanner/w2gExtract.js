/**
 * W-2G field extract waterfall.
 * IPA: Vision first for everyone (free and Starter+). Signed-in cloud if the slip looks unsure.
 * PWA / old IPA: signed-in cloud first, else tesseract.
 * Starter+ does not change extract. Bulk import is the paid difference.
 */

import { canRecognizeEdgeText, recognizeEdgeText } from '../../utils/edgeNative.js'
import { ocrW2G, parseW2GText } from './w2gOcr.js'
import { canvasToVisionJpegBlob, extractW2GFieldsWithVision } from './w2gVisionApi.js'

/**
 * @param {Record<string, string> | null | undefined} fields
 * @param {number | null | undefined} confidence 0-100
 * @returns {boolean}
 */
export function w2gExtractLooksUnsure(fields, confidence) {
  const f = fields && typeof fields === 'object' ? fields : {}
  const missingCore = ['payerName', 'payerEin', 'box1Winnings', 'dateWon'].some(
    (key) => !String(f[key] || '').trim(),
  )
  const low = typeof confidence === 'number' && Number.isFinite(confidence) && confidence < 58
  return missingCore || low
}

/**
 * @param {unknown} signal
 */
function throwIfAborted(signal) {
  if (!signal?.aborted) return
  const err = new Error('Extract cancelled.')
  err.name = 'AbortError'
  throw err
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
 * @param {HTMLCanvasElement} canvas
 */
async function recognizeNativeFromCanvas(canvas) {
  const blob = await canvasToVisionJpegBlob(canvas, { maxEdge: 2000, quality: 0.9 })
  const imageBase64 = await blobToBase64(blob)
  const result = await recognizeEdgeText({
    imageBase64,
    mimeType: blob.type || 'image/jpeg',
    purpose: 'w2g',
  })
  const text = String(result?.text || '').trim()
  if (!result?.ok || !text) {
    throw new Error(String(result?.error || 'On-device OCR found no text.'))
  }
  const fields = parseW2GText(text)
  const confidence =
    typeof result.confidence === 'number' && Number.isFinite(result.confidence)
      ? Math.round(result.confidence * 100)
      : null
  return {
    fields,
    rawText: text,
    confidence,
    engine: 'vision',
    engineLabel: 'Vision',
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function recognizeCloudFromCanvas(canvas, supabase) {
  const imageBlob = await canvasToVisionJpegBlob(canvas)
  const vision = await extractW2GFieldsWithVision({ supabase, imageBlob })
  return {
    fields: vision.fields || {},
    rawText: '',
    confidence: vision.confidence ?? null,
    engine: 'ai',
    engineLabel: 'AI',
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onProgress?: (pct: number) => void }} [opts]
 */
async function recognizeTesseractFromCanvas(canvas, opts = {}) {
  const local = await ocrW2G(canvas, { onProgress: opts.onProgress })
  return {
    fields: local.fields || {},
    rawText: local.rawText || '',
    confidence: local.confidence ?? null,
    engine: 'ocr',
    engineLabel: 'OCR',
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   supabase?: import('@supabase/supabase-js').SupabaseClient | null,
 *   signal?: AbortSignal,
 *   onProgress?: (pct: number) => void,
 *   onPhase?: (phase: 'vision' | 'ai' | 'ocr') => void,
 * }} [opts]
 * @returns {Promise<{
 *   fields: Record<string, string>,
 *   rawText: string,
 *   confidence: number | null,
 *   engine: 'vision' | 'ai' | 'ocr',
 *   engineLabel: string,
 *   subscribeRequired?: boolean,
 * }>}
 */
export async function extractW2GFields(canvas, opts = {}) {
  const supabase = opts.supabase || null
  const native = canRecognizeEdgeText()
  const useCloudVision = Boolean(supabase)
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
  const onPhase = typeof opts.onPhase === 'function' ? opts.onPhase : null
  let subscribeRequired = false

  /** @type {Awaited<ReturnType<typeof recognizeNativeFromCanvas>> | null} */
  let local = null

  if (native) {
    onPhase?.('vision')
    onProgress?.(18)
    try {
      local = await recognizeNativeFromCanvas(canvas)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
    }
    throwIfAborted(opts.signal)
    const nativeLooksGood = Boolean(local) && !w2gExtractLooksUnsure(local.fields, local.confidence)
    if (nativeLooksGood) {
      onProgress?.(100)
      return { ...local, subscribeRequired: false }
    }
    if (useCloudVision) {
      onPhase?.('ai')
      onProgress?.(local ? 58 : 28)
      try {
        const cloud = await recognizeCloudFromCanvas(canvas, supabase)
        throwIfAborted(opts.signal)
        onProgress?.(100)
        return { ...cloud, subscribeRequired: false }
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        if (local) {
          onProgress?.(100)
          return { ...local, subscribeRequired }
        }
        if (err?.code === 'subscribe_required') subscribeRequired = true
      }
    }
    if (local) {
      onProgress?.(100)
      return { ...local, subscribeRequired }
    }
  } else if (useCloudVision) {
    onPhase?.('ai')
    onProgress?.(20)
    try {
      const cloud = await recognizeCloudFromCanvas(canvas, supabase)
      throwIfAborted(opts.signal)
      onProgress?.(100)
      return { ...cloud, subscribeRequired: false }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      if (err?.code === 'subscribe_required') subscribeRequired = true
    }
  }

  onPhase?.('ocr')
  const tess = await recognizeTesseractFromCanvas(canvas, { onProgress })
  throwIfAborted(opts.signal)
  return { ...tess, subscribeRequired }
}
