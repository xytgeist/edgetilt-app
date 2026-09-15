/**
 * Raw nonce + SHA-256 hex for native Sign in with Apple.
 * Pass `hashed` to `ASAuthorizationAppleIDRequest.nonce`.
 * Pass `raw` to Supabase `signInWithIdToken`.
 */

/**
 * @param {string} message
 * @returns {Promise<string>}
 */
async function sha256Hex(message) {
  const bytes = new TextEncoder().encode(message)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * @returns {Promise<{ raw: string, hashed: string }>}
 */
export async function createAppleIdTokenNonce() {
  const raw = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const hashed = await sha256Hex(raw)
  return { raw, hashed }
}
