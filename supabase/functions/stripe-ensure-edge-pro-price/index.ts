/**
 * Service-role only. Finds or creates the $9.99/mo Edge Pro Stripe Price
 * on whatever account STRIPE_SECRET_KEY belongs to, then reports whether
 * STRIPE_PRICE_EDGE_PRO points at a Price that exists in that account/mode.
 */
import Stripe from 'npm:stripe@17.7.0'
import { isKnownServiceRoleBearer } from '../_shared/adminAuth.ts'
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'

const EDGE_PRO_CENTS = 999
const EDGE_PRO_SLUG = 'edge-pro'

function requireServiceRole(req: Request): boolean {
  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() || ''
  return Boolean(auth && service && isKnownServiceRoleBearer(auth, service, supabaseUrl))
}

function isMissingPrice(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'resource_missing') return true
  return /No such price/i.test(err instanceof Error ? err.message : String(err || ''))
}

async function findExistingEdgeProMonthly(stripe: Stripe): Promise<Stripe.Price | null> {
  const listed = await stripe.prices.list({
    active: true,
    type: 'recurring',
    limit: 100,
  })
  const match = listed.data.find((price) => {
    if (price.unit_amount !== EDGE_PRO_CENTS) return false
    if (price.recurring?.interval !== 'month') return false
    const slug = String(price.metadata?.product_slug || '').trim()
    const nick = String(price.nickname || '')
    return slug === EDGE_PRO_SLUG || /edge\s*pro/i.test(nick)
  })
  return match || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: billingCorsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!requireServiceRole(req)) {
    return jsonResponse({ error: 'Service role required.' }, 401)
  }

  const secret = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
  if (!secret) {
    return jsonResponse({ error: 'Missing STRIPE_SECRET_KEY.' }, 500)
  }

  const configured = Deno.env.get('STRIPE_PRICE_EDGE_PRO')?.trim() || null
  const stripe = new Stripe(secret)
  const livemode = secret.startsWith('sk_live_')

  try {
    if (configured) {
      try {
        const existing = await stripe.prices.retrieve(configured)
        if (existing?.id && existing.active) {
          return jsonResponse({
            ok: true,
            livemode,
            created: false,
            priceId: existing.id,
            configured,
            configuredOk: true,
          })
        }
      } catch (err) {
        if (!isMissingPrice(err)) throw err
      }
    }

    const found = await findExistingEdgeProMonthly(stripe)
    if (found) {
      return jsonResponse({
        ok: true,
        livemode,
        created: false,
        priceId: found.id,
        configured,
        configuredOk: configured === found.id,
        configuredError: configured
          ? `No such price: '${configured}'`
          : 'STRIPE_PRICE_EDGE_PRO is not set.',
      })
    }

    const product = await stripe.products.create({
      name: 'Edge Pro',
      description: 'Platform social tier',
      metadata: { product_slug: EDGE_PRO_SLUG },
    })
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: EDGE_PRO_CENTS,
      recurring: { interval: 'month' },
      nickname: 'Edge Pro monthly',
      metadata: { product_slug: EDGE_PRO_SLUG },
    })

    return jsonResponse({
      ok: true,
      livemode,
      created: true,
      priceId: price.id,
      productId: product.id,
      configured,
      configuredOk: false,
      configuredError: configured
        ? `No such price: '${configured}'`
        : 'STRIPE_PRICE_EDGE_PRO is not set.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '')
    return jsonResponse({ error: msg || 'Stripe ensure failed.' }, 500)
  }
})
