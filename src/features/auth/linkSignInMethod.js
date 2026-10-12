import { edgeNativeInvoke, isEdgeiOSShell } from '../../utils/edgeNative.js'
import { createAppleIdTokenNonce } from './appleIdTokenNonce.js'

export function friendlyLinkError(error, label = 'That sign-in') {
  const code = String(error?.code || '').toLowerCase()
  const msg = String(error?.message || '')
  if (code === 'identity_already_exists' || /already linked|already exists|already registered/i.test(msg)) {
    return `${label} already belongs to a different EdgeTilt account. Sign in with it and delete that account (Settings → Account info) first, or use Connect account right after signing up.`
  }
  if (code === 'manual_linking_disabled' || /manual linking/i.test(msg)) {
    return 'Connecting sign-in methods is not turned on yet. Try again later.'
  }
  return msg || 'Could not connect. Try again.'
}

/** Returns `{ cancelled: true }` if the person backed out of the Apple sheet. */
export async function linkAppleIdentity(supabase) {
  if (!isEdgeiOSShell()) throw new Error('Connecting Apple works in the Edge iOS app.')
  const { raw, hashed } = await createAppleIdTokenNonce()
  const native = await edgeNativeInvoke('signInWithApple', { nonce: hashed })
  if (native?.cancelled) return { cancelled: true }
  if (!native?.identityToken) throw new Error(native?.error || 'Apple did not return a token.')
  const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token: native.identityToken, nonce: raw })
  if (error) throw error
  return { cancelled: false }
}

/**
 * Link Google. EdgeAndroid Custom Tabs completes in-process (`linked: true`).
 * Browser / other shells redirect away (`linked: false` … caller must not toast yet).
 */
export async function linkGoogleIdentity(supabase) {
  const { canNativeGoogleOAuth, nativeGoogleOAuthRedirectTo, runNativeGoogleOAuth } =
    await import('./nativeGoogleOAuth.js')
  if (canNativeGoogleOAuth()) {
    const result = await runNativeGoogleOAuth(supabase, {
      redirectTo: nativeGoogleOAuthRedirectTo(`${window.location.origin}/`),
      mode: 'link',
    })
    if (result?.cancelled) return { cancelled: true, linked: false }
    return { cancelled: false, linked: true }
  }
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  })
  if (error) throw error
  return { cancelled: false, linked: false }
}
