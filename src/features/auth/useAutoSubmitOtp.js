import { useEffect, useRef } from 'react'

/**
 * When a 6-digit OTP is complete, submit once. Clearing the field (resend) resets.
 * @param {{
 *   code: string,
 *   scope: string,
 *   busy?: boolean,
 *   onSubmit: () => (void | Promise<void>),
 * }} args
 */
export function useAutoSubmitOtp({ code, scope, busy = false, onSubmit }) {
  const lastKeyRef = useRef('')
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit

  useEffect(() => {
    const token = String(code || '').replace(/\D/g, '')
    if (!token) {
      lastKeyRef.current = ''
      return
    }
    if (token.length !== 6 || !scope || busy) return
    const key = `${scope}:${token}`
    if (lastKeyRef.current === key) return
    lastKeyRef.current = key
    void onSubmitRef.current?.()
  }, [busy, code, scope])
}
