import { useRef } from 'react'

export const TAB_ERROR_COUNT_KEY = 'lvsp_tab_error_count'

export const TAB_ERROR_TEST_PREFIX = '[Staff test]'

export function readTabErrorStrikeCount() {
  try {
    return parseInt(sessionStorage.getItem(TAB_ERROR_COUNT_KEY) || '0', 10)
  } catch {
    return 0
  }
}

export function resetTabErrorStrikes() {
  try {
    sessionStorage.removeItem(TAB_ERROR_COUNT_KEY)
  } catch {
    // ignore
  }
}

export function isStaffTabErrorTest(error) {
  return String(error?.message || '').startsWith(TAB_ERROR_TEST_PREFIX)
}

/**
 * Throws once per `trigger` bump so Replay 2nd Down can recover without looping.
 * @param {{ trigger?: number, lastSimulatedRef: React.MutableRefObject<number> }} props
 */
export function TabErrorSimulator({ trigger = 0, lastSimulatedRef }) {
  if (trigger > lastSimulatedRef.current) {
    lastSimulatedRef.current = trigger
    const strikes = readTabErrorStrikeCount()
    throw new Error(
      `${TAB_ERROR_TEST_PREFIX} Tab error simulator (#${trigger}). Session strikes before catch: ${strikes}.`,
    )
  }
  return null
}
