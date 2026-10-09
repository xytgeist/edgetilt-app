/**
 * Lounge @ffmpeg/core rejects with a non-Error string when the browser lacks Wasm SIMD
 * (`s128`). Keep this module free of @ffmpeg imports so boot can install the guard.
 */

/**
 * @param {unknown} reason
 * @returns {boolean}
 */
export function isFfmpegWasmLoadRejection(reason) {
  const s = reason instanceof Error ? reason.message : String(reason ?? '')
  return /WebAssembly\.instantiate|experimental-wasm-simd|invalid value type ['"]?s128|Aborted\(CompileError/i.test(
    s,
  )
}

/**
 * Swallow orphan worker rejects so Lounge ffmpeg prefetch cannot become a Sentry
 * UnhandledRejection. Safe to call more than once.
 */
export function installFfmpegWasmRejectionGuard() {
  if (typeof window === 'undefined' || window.__edgeFfmpegWasmRejectionGuard) return
  window.__edgeFfmpegWasmRejectionGuard = true
  window.addEventListener('unhandledrejection', (event) => {
    if (!isFfmpegWasmLoadRejection(event.reason)) return
    event.preventDefault()
  })
}
