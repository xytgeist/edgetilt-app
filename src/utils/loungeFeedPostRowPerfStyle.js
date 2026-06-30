/** Scroll perf for feed/profile post rows - skip on coarse pointers (Android touch hit-test bugs with content-visibility). */
export function loungeFeedPostRowPerfStyle() {
  if (typeof window === 'undefined') return undefined
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return undefined
  } catch {
    return undefined
  }
  return { contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }
}
