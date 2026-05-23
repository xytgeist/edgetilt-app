import { readLoungeFeedVideoDebugEnabled } from '../../utils/loungeFeedVideoDebugPref.js'
import {
  readLoungeBadgeTipDomSnapshot,
  reportLoungeBadgeTipDebug,
  setLoungeBadgeTipDebugSnapshot,
} from './loungeBadgeTipDebugRegistry.js'

export function loungeBadgeTipDebugEnabled() {
  return readLoungeFeedVideoDebugEnabled()
}

/**
 * @param {string} tipLabel
 * @param {string} kind
 * @param {string} detail
 * @param {{ gen?: number, tipTextEl?: HTMLElement | null, tipShellEl?: HTMLElement | null }} [extra]
 */
export function logLoungeBadgeTipDebug(tipLabel, kind, detail, extra = {}) {
  if (!readLoungeFeedVideoDebugEnabled()) return
  const dom =
    extra.tipTextEl || extra.tipShellEl
      ? readLoungeBadgeTipDomSnapshot(extra.tipTextEl ?? null, extra.tipShellEl ?? null)
      : null
  const domSuffix = dom
    ? ` · cls=${dom.className.includes('preroll') ? 'preroll' : dom.className.includes('tip-in') ? 'in' : dom.className.includes('tip-out') ? 'out' : '?'} play=${dom.animationPlayState} op=${dom.opacity}`
    : ''
  reportLoungeBadgeTipDebug(tipLabel, kind, `${detail}${domSuffix}`, { gen: extra.gen })
}

/**
 * @param {string} tipLabel
 * @param {{ mounted: boolean, exiting: boolean, animInReady: boolean, showGeneration: number, finePointerHover: boolean, tipTextEl?: HTMLElement | null, tipShellEl?: HTMLElement | null }} state
 */
export function syncLoungeBadgeTipDebugSnapshot(tipLabel, state) {
  if (!readLoungeFeedVideoDebugEnabled()) return
  setLoungeBadgeTipDebugSnapshot({
    tip: tipLabel,
    mounted: state.mounted,
    exiting: state.exiting,
    animInReady: state.animInReady,
    gen: state.showGeneration,
    finePointerHover: state.finePointerHover,
    dom: readLoungeBadgeTipDomSnapshot(state.tipTextEl ?? null, state.tipShellEl ?? null),
    updatedAt: Date.now(),
  })
}
