/**
 * EdgeiOS shell safe-area CSS vars.
 *
 * Safari / PWA: `env(safe-area-inset-*)` is trustworthy.
 * WKWebView shell: native injects `--edge-sat|sar|sab|sal` (see `ios/EdgeTilt/EdgeSafeAreaInsets.swift`).
 * Web chrome uses `max(env(...), var(--edge-*, 0px))` so neither path double-pads.
 *
 * `AGENT_RULE_EDGE_IOS_SAFE_AREA` — searchability token.
 */

export const EDGE_SAFE_AREA_CSS = {
  top: 'max(env(safe-area-inset-top,0px),var(--edge-sat,0px))',
  right: 'max(env(safe-area-inset-right,0px),var(--edge-sar,0px))',
  bottom: 'max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))',
  left: 'max(env(safe-area-inset-left,0px),var(--edge-sal,0px))',
}

/**
 * JS pixel read of top safe area for fixed chrome positioning.
 * Prefer `--edge-sat` (shell inject); else probe `env(safe-area-inset-top)` (Safari/PWA).
 * Needed when Lounge keep-alive is `display:none` (other tabs) and feed
 * `getBoundingClientRect().top` is 0 … dock Settings/Search would sit under the status bar.
 *
 * @returns {number}
 */
export function readCssSafeAreaTopPx() {
  if (typeof document === 'undefined') return 0
  const fromVar = parseFloat(
    String(getComputedStyle(document.documentElement).getPropertyValue('--edge-sat') || '').trim(),
  )
  if (Number.isFinite(fromVar) && fromVar > 0) return Math.round(fromVar)

  if (!document.body) return 0
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)'
  document.body.appendChild(probe)
  const pt = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()
  return Math.round(pt)
}
