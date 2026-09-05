/** App Store product ids. Keep in lockstep with `src/utils/edgeIapProducts.js`. */

export const APPLE_IAP_PLATFORM_PRODUCT_TO_SLUG: Record<string, string> = {
  'com.edgetilt.app.slots_edge_starter.monthly': 'slots-edge-starter',
  'com.edgetilt.app.slots_edge_starter.annual': 'slots-edge-starter',
  'com.edgetilt.app.slots_edge.monthly': 'slots-edge',
  'com.edgetilt.app.slots_edge.annual': 'slots-edge',
  'com.edgetilt.app.slots_edge_lifetime': 'slots-edge-lifetime',
  'com.edgetilt.app.edge_pro.monthly': 'edge-pro',
}

export const APPLE_IAP_FAN_PRODUCT_TO_TIER: Record<string, string> = {
  'com.edgetilt.app.fan_tier_499.monthly': 'fan-tier-499',
  'com.edgetilt.app.fan_tier_999.monthly': 'fan-tier-999',
  'com.edgetilt.app.fan_tier_1999.monthly': 'fan-tier-1999',
  'com.edgetilt.app.fan_tier_4999.monthly': 'fan-tier-4999',
  'com.edgetilt.app.fan_tier_9999.monthly': 'fan-tier-9999',
  'com.edgetilt.app.fan_tier_14999.monthly': 'fan-tier-14999',
  'com.edgetilt.app.fan_tier_24999.monthly': 'fan-tier-24999',
}

export function intervalFromAppleProductId(productId: string): 'monthly' | 'annual' | null {
  if (productId.endsWith('.annual')) return 'annual'
  if (productId.endsWith('.monthly')) return 'monthly'
  return null
}

export function decodeAppleJwsPayload(jws: string): Record<string, unknown> | null {
  const raw = String(jws || '').trim()
  if (!raw) return null

  const jwtParts = raw.split('.')
  if (jwtParts.length >= 2) {
    const parsed = jsonFromBase64Url(jwtParts[1])
    if (parsed && (parsed.productId || parsed.originalTransactionId)) return parsed
  }

  try {
    const asJson = JSON.parse(atob(raw))
    if (asJson && typeof asJson === 'object') return asJson as Record<string, unknown>
  } catch {
    // old IPA sent base64(jsonRepresentation)
  }
  return null
}

export function expiresAtFromApplePayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null
  const ms = Number(payload.expiresDate)
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString()
  const iso = String(payload.expiresAt || payload.expirationDate || '').trim()
  return iso || null
}

function jsonFromBase64Url(segment: string): Record<string, unknown> | null {
  try {
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const parsed = JSON.parse(atob(b64 + pad))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
