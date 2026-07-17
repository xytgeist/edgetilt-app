/**
 * Admin + creator portal API for affiliates.
 */

export async function fetchAdminAffiliateSnapshot(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_affiliate_portal_snapshot')
  if (error) throw error
  return data && typeof data === 'object'
    ? data
    : { packages: [], affiliates: [], commissions: [], hold_days: 45 }
}

export async function upsertAffiliate(supabaseClient, payload) {
  const { data, error } = await supabaseClient.rpc('admin_affiliate_upsert', {
    p_payload: payload,
  })
  if (error) throw error
  return data
}

export async function markCommissionsPaid(supabaseClient, commissionIds, payoutRef = null) {
  const { data, error } = await supabaseClient.rpc('admin_affiliate_mark_commissions_paid', {
    p_commission_ids: commissionIds,
    p_payout_ref: payoutRef,
  })
  if (error) throw error
  return Number(data) || 0
}

export async function fetchMyAffiliatePortal(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('get_my_affiliate_portal')
  if (error) throw error
  return data || null
}

export async function checkIAmActiveAffiliate(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('i_am_active_affiliate')
  if (error) {
    if (error.code === 'PGRST202' || /i_am_active_affiliate/i.test(error.message || '')) {
      return false
    }
    throw error
  }
  return Boolean(data)
}

export async function upsertMyTaxProfile(supabaseClient, payload) {
  const { data, error } = await supabaseClient.rpc('upsert_my_affiliate_tax_profile', {
    p_payload: payload,
  })
  if (error) throw error
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {File} file
 * @param {string} userId
 */
export async function uploadAffiliateTaxDocument(supabaseClient, file, userId) {
  const safeName = String(file.name || 'tax.pdf')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80)
  const path = `${userId}/${Date.now()}_${safeName}`
  const { error } = await supabaseClient.storage.from('affiliate-tax-docs').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function startAffiliateConnectOnboarding(supabaseClient) {
  const { data, error, response } = await supabaseClient.functions.invoke('affiliate-connect', {
    body: { action: 'onboard' },
  })
  if (error) {
    let detail = ''
    try {
      const raw = await response?.clone?.().text()
      const body = raw ? JSON.parse(raw) : null
      detail = body?.error || ''
    } catch {
      // ignore
    }
    throw new Error(detail || error.message || 'Could not start Connect onboarding.')
  }
  if (data?.error) throw new Error(String(data.error))
  return data
}

export async function refreshAffiliateConnectStatus(supabaseClient) {
  const { data, error } = await supabaseClient.functions.invoke('affiliate-connect', {
    body: { action: 'refresh' },
  })
  if (error) throw new Error(error.message || 'Could not refresh Connect status.')
  if (data?.error) throw new Error(String(data.error))
  return data
}

export async function adminPayCommissionsViaConnect(supabaseClient, commissionIds) {
  const { data, error } = await supabaseClient.functions.invoke('affiliate-connect', {
    body: { action: 'pay', commission_ids: commissionIds },
  })
  if (error) throw new Error(error.message || 'Connect payout failed.')
  if (data?.error) throw new Error(String(data.error))
  return data
}

export function formatCents(cents) {
  const n = Number(cents) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100)
}

export function commissionsToCsv(commissions) {
  const rows = Array.isArray(commissions) ? commissions : []
  const header = [
    'id',
    'affiliate_code',
    'affiliate_name',
    'status',
    'product_slug',
    'price_interval',
    'net_cents',
    'commission_pct',
    'commission_cents',
    'payable_at',
    'paid_at',
    'payout_ref',
    'created_at',
  ]
  const escape = (v) => {
    const s = v == null ? '' : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [header.join(',')]
  for (const c of rows) {
    lines.push(
      [
        c.id,
        c.affiliate_code,
        c.affiliate_name,
        c.status,
        c.product_slug,
        c.price_interval,
        c.net_cents,
        c.commission_pct,
        c.commission_cents,
        c.payable_at,
        c.paid_at,
        c.payout_ref,
        c.created_at,
      ]
        .map(escape)
        .join(','),
    )
  }
  return `${lines.join('\n')}\n`
}
