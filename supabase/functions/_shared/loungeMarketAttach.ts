/**
 * Persist market_embeds on Lounge feed posts (service role + Edge attach action).
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  MARKET_EMBED_MAX,
  buildMarketEmbed,
  resolveMarketSymbolsForAttach,
  type MarketAssetClass,
  type MarketEmbed,
} from './finnhubMarket.ts'
import { upsertMarketInstrumentFromEmbed } from './marketInstrumentRegistry.ts'

export function loungeMarketPublicOrigin(raw?: string): string {
  return String(raw || Deno.env.get('LOUNGE_PUBLIC_ORIGIN') || 'https://lvslotpro.com').replace(/\/+$/, '')
}

export async function attachMarketEmbedsToPost(
  admin: SupabaseClient,
  postId: string,
  caption: string,
  symbols: Array<{ symbol: string; asset_class: MarketAssetClass }>,
  origin?: string,
): Promise<{ embeds: MarketEmbed[]; skipped: string[] }> {
  const base = loungeMarketPublicOrigin(origin)
  const limited = symbols.slice(0, MARKET_EMBED_MAX)
  const embeds: MarketEmbed[] = []
  const skipped: string[] = []
  for (const item of limited) {
    try {
      const embed = await buildMarketEmbed(item.symbol, item.asset_class, caption)
      embed.og_image_url = `${base}/api/lounge-market-og?postId=${encodeURIComponent(postId)}&symbol=${encodeURIComponent(embed.display_symbol)}`
      embeds.push(embed)
      await upsertMarketInstrumentFromEmbed(admin, embed)
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'embed build failed'
      skipped.push(`${item.symbol}: ${detail}`)
    }
  }
  const { error } = await admin
    .from('community_feed_posts')
    .update({ market_embeds: embeds })
    .eq('id', postId)
  if (error) {
    const msg = String(error.message || '')
    if (/market_embeds|schema cache/i.test(msg)) {
      throw new Error(
        'Apply migration 20260609120000_lounge_market_embeds.sql on this Supabase project.',
      )
    }
    throw new Error(msg || 'Could not save market embeds.')
  }
  return { embeds, skipped }
}

/** Resolve caption $ cashtags and attach mini-chart embeds (best-effort). */
export async function attachMarketEmbedsFromCaptionCashtags(
  admin: SupabaseClient,
  postId: string,
  caption: string,
  origin?: string,
): Promise<{ embeds: MarketEmbed[]; skipped: string[] } | null> {
  const cap = String(caption || '').trim()
  if (!cap) return null
  const symbols = await resolveMarketSymbolsForAttach(cap, [])
  if (!symbols.length) return null
  return attachMarketEmbedsToPost(admin, postId, cap, symbols, origin)
}
