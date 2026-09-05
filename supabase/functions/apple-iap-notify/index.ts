import { jsonResponse } from '../_shared/billingCors.ts'
import {
  applyAppleIapNotification,
  createBillingAdmin,
  markAppleNotificationEventFailed,
  recordAppleNotificationEvent,
} from '../_shared/billingDb.ts'
import {
  APPLE_IAP_BUNDLE_ID,
  assertAppleBundleId,
  decodeAppleNotification,
  transactionFromAppleNotification,
  verifyAppleSignedJws,
} from '../_shared/appleIapJws.ts'

const IGNORE_TYPES = new Set([
  'CONSUMPTION_REQUEST',
  'ONE_TIME_CHARGE',
  'PRICE_INCREASE',
  'REFUND_DECLINED',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const admin = createBillingAdmin()
  let notificationUUID = ''

  try {
    const body = await req.json().catch(() => ({}))
    const signedPayload = String(body?.signedPayload || '').trim()
    if (!signedPayload) return jsonResponse({ error: 'Missing signedPayload.' }, 400)

    const outer = await verifyAppleSignedJws(signedPayload)
    const note = decodeAppleNotification(outer)
    notificationUUID = note.notificationUUID
    if (note.bundleId) assertAppleBundleId(note.bundleId)

    if (note.notificationType === 'TEST') {
      return jsonResponse({ ok: true, type: 'TEST' })
    }

    if (notificationUUID) {
      const first = await recordAppleNotificationEvent(admin, {
        notificationUuid: notificationUUID,
        notificationType: note.notificationType,
        subtype: note.subtype,
      })
      if (!first) return jsonResponse({ ok: true, duplicate: true })
    }

    if (IGNORE_TYPES.has(note.notificationType)) {
      return jsonResponse({ ok: true, ignored: note.notificationType })
    }

    let txClaims: Record<string, unknown> | null = null
    if (note.signedTransactionInfo) {
      txClaims = await verifyAppleSignedJws(note.signedTransactionInfo)
      const txBundle = String(txClaims.bundleId || '').trim()
      if (txBundle) assertAppleBundleId(txBundle)
    }

    const tx = transactionFromAppleNotification(note.signedTransactionInfo, txClaims)
    if (tx.bundleId) assertAppleBundleId(tx.bundleId)
    if (!tx.originalTransactionId) {
      return jsonResponse({ ok: true, skipped: 'no_original_transaction' })
    }

    const result = await applyAppleIapNotification(admin, {
      originalTransactionId: tx.originalTransactionId,
      notificationType: note.notificationType,
      subtype: note.subtype,
      expiresAt: tx.expiresAt,
    })

    return jsonResponse({
      ok: true,
      type: note.notificationType,
      subtype: note.subtype,
      original_transaction_id: tx.originalTransactionId,
      updated: result.updated,
      bundle_id: note.bundleId || APPLE_IAP_BUNDLE_ID,
      environment: note.environment || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('apple-iap-notify:', message)
    if (notificationUUID) {
      await markAppleNotificationEventFailed(admin, notificationUUID, message)
    }
    return jsonResponse({ error: message || 'Notification failed.' }, 500)
  }
})
