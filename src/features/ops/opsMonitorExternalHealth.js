/** External health probe status helpers for Edge Monitor. */

/** @typedef {'ok' | 'warn' | 'critical' | 'info' | 'unknown'} OpsExternalHealthStatus */

/** @param {OpsExternalHealthStatus | string | undefined} status */
export function opsExternalHealthLabel(status) {
  switch (status) {
    case 'ok':
      return 'OK'
    case 'warn':
      return 'Warn'
    case 'critical':
      return 'Critical'
    case 'info':
      return 'Info'
    default:
      return 'Unknown'
  }
}

/** @param {OpsExternalHealthStatus | string | undefined} status */
export function opsExternalHealthClass(status) {
  switch (status) {
    case 'ok':
      return 'text-emerald-300 bg-emerald-950/40 ring-emerald-500/30'
    case 'warn':
      return 'text-amber-200 bg-amber-950/40 ring-amber-500/30'
    case 'critical':
      return 'text-red-200 bg-red-950/40 ring-red-500/30'
    case 'info':
      return 'text-zinc-300 bg-zinc-800/60 ring-zinc-600/30'
    default:
      return 'text-zinc-400 bg-zinc-900/80 ring-zinc-700/40'
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} probe
 * @param {'stripe' | 'sentry' | 'cloudflare' | 'vercel' | 'supabase'} key
 * @returns {OpsExternalHealthStatus}
 */
export function opsExternalProbeHealth(probe, key) {
  if (!probe) return 'unknown'

  if (key === 'vercel' || key === 'supabase') {
    return probe.configured === false ? 'info' : 'ok'
  }

  if (!probe.configured) return 'info'
  if (probe.error) return 'critical'
  if (probe.ok === false) return 'critical'

  if (key === 'stripe') {
    const pastDue = Number(probe.subscriptions_past_due)
    if (Number.isFinite(pastDue) && pastDue > 0) return 'warn'
    return 'ok'
  }

  if (key === 'sentry') {
    const unresolved = Number(probe.unresolved_issues)
    if (Number.isFinite(unresolved) && unresolved > 0) return 'warn'
    return 'ok'
  }

  if (key === 'cloudflare') {
    const pending = Number(probe.pending_uploads)
    if (Number.isFinite(pending) && pending > 0) return 'warn'
    return 'ok'
  }

  return 'ok'
}

/**
 * @param {Record<string, unknown> | null | undefined} external
 * @param {{ error?: string | null }} [ctx]
 * @returns {OpsExternalHealthStatus}
 */
export function opsExternalHealthOverall(external, ctx = {}) {
  if (ctx.error) return 'critical'
  if (!external?.probes) return 'unknown'

  const keys = /** @type {const} */ (['stripe', 'sentry', 'cloudflare', 'vercel', 'supabase'])
  const statuses = keys.map((key) => opsExternalProbeHealth(external.probes[key], key))

  if (statuses.includes('critical')) return 'critical'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.every((status) => status === 'info' || status === 'unknown')) return 'info'
  return 'ok'
}
