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
  top: 'max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px))',
  right: 'max(env(safe-area-inset-right, 0px), var(--edge-sar, 0px))',
  bottom: 'max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px))',
  left: 'max(env(safe-area-inset-left, 0px), var(--edge-sal, 0px))',
}
