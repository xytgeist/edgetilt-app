/**
 * Yahoo `/league/{key}/transactions;types=pending_trade;team_key={mine}` → open offers (pure parse, no fetch).
 * Each `transaction` is `[meta, { players }]`; every player carries its own `transaction_data` (source → destination).
 * Proposed offers are open; `accepted` ones wait on the league / commissioner. Rejected / vetoed / cancelled drop.
 */
export type YahooTradePlayer = {
  player_key: string
  name: string | null
  position: string | null
  nfl_team: string | null
  from_team_key: string | null
  to_team_key: string | null
}

export type YahooPendingTradeRaw = {
  transaction_key: string
  status: string
  trader_team_key: string | null
  tradee_team_key: string | null
  proposed_at: string | null
  players: YahooTradePlayer[]
}

const OPEN = new Set(['proposed', 'accepted'])

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

/** Merge Yahoo's fragment arrays (`[[{a}, {b}], {c}]`) into one object. */
function merge(v: unknown, acc: Record<string, unknown> = {}): Record<string, unknown> {
  if (Array.isArray(v)) for (const x of v) merge(x, acc)
  else if (v && typeof v === 'object') Object.assign(acc, v as Record<string, unknown>)
  return acc
}

function playersOf(block: unknown): YahooTradePlayer[] {
  const out: YahooTradePlayer[] = []
  const obj = block && typeof block === 'object' ? (block as Record<string, unknown>) : {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'count' || !v || typeof v !== 'object') continue
    const p = merge((v as Record<string, unknown>).player)
    const key = str(p.player_key)
    if (!key) continue
    const td = merge(p.transaction_data)
    const name = p.name && typeof p.name === 'object' ? str((p.name as Record<string, unknown>).full) : str(p.name)
    out.push({
      player_key: key,
      name: name || null,
      position: str(p.display_position) || null,
      nfl_team: str(p.editorial_team_abbr).toUpperCase() || null,
      from_team_key: str(td.source_team_key) || null,
      to_team_key: str(td.destination_team_key) || null,
    })
  }
  return out
}

export function parseYahooPendingTrades(payload: unknown): YahooPendingTradeRaw[] {
  const out: YahooPendingTradeRaw[] = []
  const seen = new Set<string>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const x of node) walk(x)
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'transaction' && Array.isArray(v)) {
        const parts = v as unknown[]
        const playersPart = parts.find((x) => x && typeof x === 'object' && !Array.isArray(x) && 'players' in (x as object)) as
          | Record<string, unknown>
          | undefined
        const meta = merge(parts.filter((x) => x !== playersPart))
        const id = str(meta.transaction_key)
        const status = str(meta.status).toLowerCase()
        if (!id || seen.has(id) || str(meta.type) !== 'pending_trade' || !OPEN.has(status)) continue
        seen.add(id)
        const t = Number(meta.trade_proposed_time)
        out.push({
          transaction_key: id,
          status,
          trader_team_key: str(meta.trader_team_key) || null,
          tradee_team_key: str(meta.tradee_team_key) || null,
          proposed_at: Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : null,
          players: playersOf(playersPart?.players),
        })
      } else walk(v)
    }
  }
  walk(payload)
  return out
}
