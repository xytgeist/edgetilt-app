/**
 * Post-mount tweaks for scanic's corner-editor toolbar.
 * Scanic only ships Reset/Cancel/Apply icons; Reset uses a circular arrow that reads as "rotate".
 */

/** Corner-brackets: reset handles without looking like image rotate. */
export const SCANIC_ICON_RESET_CORNERS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>`

/** Rotate 90° clockwise. */
export const SCANIC_ICON_ROTATE_CW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6"/><path d="M21 3v6h-6"/></svg>`

/**
 * @param {HTMLElement | null | undefined} host
 * @param {{ onRotate?: () => void }} [opts]
 */
export function enhanceScanicCornerToolbar(host, opts = {}) {
  const toolbar = host?.querySelector?.('.scanic-toolbar')
  if (!toolbar || toolbar.dataset.w2gEnhanced === '1') return
  toolbar.dataset.w2gEnhanced = '1'

  const resetBtn = toolbar.querySelector('.scanic-btn-reset')
  if (resetBtn) {
    resetBtn.innerHTML = SCANIC_ICON_RESET_CORNERS
    resetBtn.title = 'Reset corners'
    resetBtn.setAttribute('aria-label', 'Reset corners')
  }

  if (typeof opts.onRotate !== 'function') return

  const rotateBtn = document.createElement('button')
  rotateBtn.type = 'button'
  rotateBtn.className = 'scanic-btn-rotate'
  rotateBtn.title = 'Rotate image'
  rotateBtn.setAttribute('aria-label', 'Rotate image')
  rotateBtn.innerHTML = SCANIC_ICON_ROTATE_CW
  rotateBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    opts.onRotate?.()
  })

  if (resetBtn) toolbar.insertBefore(rotateBtn, resetBtn)
  else toolbar.insertBefore(rotateBtn, toolbar.firstChild)
}
