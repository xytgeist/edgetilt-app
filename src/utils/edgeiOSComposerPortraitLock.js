import { useEffect } from 'react'
import { edgeNativeInvoke, isEdgeiOSShell } from './edgeNative.js'

let lockCount = 0
let pending = Promise.resolve()

function canLock() {
  if (typeof window === 'undefined' || !isEdgeiOSShell()) return false
  return typeof window.EdgeNative?.setOrientationLock === 'function'
}

async function sendLock(lock) {
  if (!canLock()) return
  try {
    await edgeNativeInvoke('setOrientationLock', { lock })
  } catch {
    /* old IPA / bridge reject … stay landscape */
  }
}

function queueLock(lock) {
  pending = pending.then(() => sendLock(lock)).catch(() => {})
}

function acquireEdgeiOSComposerPortraitLock() {
  lockCount += 1
  if (lockCount === 1) queueLock('portrait')
}

function releaseEdgeiOSComposerPortraitLock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) queueLock('none')
}

/**
 * IPA iPhone only. While `active`, force portrait. Unlock when the last composer closes
 * so a still-sideways phone can rotate back. Safari / PWA / iPad no-op.
 *
 * @param {boolean} active
 */
export function useEdgeiOSComposerPortraitLock(active) {
  const should = Boolean(active)
  useEffect(() => {
    if (!should || !canLock()) return undefined
    acquireEdgeiOSComposerPortraitLock()
    return () => releaseEdgeiOSComposerPortraitLock()
  }, [should])
}
