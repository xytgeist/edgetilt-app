/** Verify App Store Server Notifications V2 / StoreKit JWS using the embedded x5c leaf. */
import * as jose from 'npm:jose@5.9.6'
import { decodeAppleJwsPayload, expiresAtFromApplePayload } from './appleIapCatalog.ts'

export const APPLE_IAP_BUNDLE_ID = 'com.edgetilt.app'

export async function verifyAppleSignedJws(jws: string): Promise<Record<string, unknown>> {
  const raw = String(jws || '').trim()
  if (!raw) throw new Error('Missing signed payload.')

  const header = jose.decodeProtectedHeader(raw)
  const certs = Array.isArray(header.x5c) ? header.x5c.map((c) => String(c || '').trim()).filter(Boolean) : []
  if (!certs.length) throw new Error('Apple JWS is missing an x5c certificate.')

  const pem = `-----BEGIN CERTIFICATE-----\n${certs[0]}\n-----END CERTIFICATE-----`
  const key = await jose.importX509(pem, String(header.alg || 'ES256'))
  const { payload } = await jose.jwtVerify(raw, key, {
    algorithms: ['ES256'],
  })
  if (!payload || typeof payload !== 'object') throw new Error('Apple JWS payload is empty.')
  return payload as Record<string, unknown>
}

export function decodeAppleNotification(payload: Record<string, unknown>) {
  const notificationType = String(payload.notificationType || '').trim()
  const subtype = String(payload.subtype || '').trim() || null
  const notificationUUID = String(payload.notificationUUID || '').trim()
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : {}
  const bundleId = String(data.bundleId || payload.bundleId || '').trim()
  const environment = String(data.environment || payload.environment || '').trim()
  return {
    notificationType,
    subtype,
    notificationUUID,
    bundleId,
    environment,
    signedTransactionInfo: String(data.signedTransactionInfo || '').trim(),
    signedRenewalInfo: String(data.signedRenewalInfo || '').trim(),
  }
}

export function assertAppleBundleId(bundleId: string) {
  if (bundleId && bundleId !== APPLE_IAP_BUNDLE_ID) {
    throw new Error(`Unexpected Apple bundle id: ${bundleId}`)
  }
}

export function transactionFromAppleNotification(
  signedTransactionInfo: string,
  verifiedTransaction?: Record<string, unknown> | null,
) {
  const claims = verifiedTransaction || decodeAppleJwsPayload(signedTransactionInfo)
  return {
    originalTransactionId: String(claims?.originalTransactionId || '').trim(),
    transactionId: String(claims?.transactionId || '').trim(),
    productId: String(claims?.productId || '').trim(),
    bundleId: String(claims?.bundleId || '').trim(),
    expiresAt: expiresAtFromApplePayload(claims),
    revocationDate: Number(claims?.revocationDate) || null,
  }
}
