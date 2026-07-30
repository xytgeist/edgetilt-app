/**
 * Fetch Wynn series (JSON-LD) + MTTDB live + online lobbies + merge region catalog JSON → upsert.
 *
 * Usage:
 *   npm run poker:catalog:sync:test
 *   npm run poker:catalog:sync:test:dry
 *   node scripts/sync-poker-tournament-catalog.mjs --target=test --file=supabase/seed/poker_tournament_catalog_ca.json
 */

import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, createSupabaseServiceClient, targetHuman } from './lib/supabaseEnv.mjs'
import {
  buildCatalogUpsertRowsFromPayloads,
  dedupeCatalogRows,
  isoDateLocal,
  loadCatalogSeedFiles,
  normalizeCatalogVenueName,
  parseBuyInFromText,
  repoRootFromCatalogLib,
} from './lib/pokerTournamentCatalog.mjs'
import { fetchMttdbLiveCatalogOneOffs, fetchMttdbOnlineCatalogOneOffs } from './lib/mttdbCatalogFetch.mjs'
import { createMttdbVenueResolver } from './lib/mttdbCatalogVenues.mjs'
import { createMttdbSiteResolver } from './lib/mttdbCatalogSites.mjs'

const repoRoot = repoRootFromCatalogLib
const WYNN_URL = 'https://www.wynnpoker.com/tournaments'
const FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  /** @type {string | null} */
  let file = null
  let noPrune = false
  let skipFetch = false
  let noGeocode = false
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--no-prune') noPrune = true
    else if (arg === '--skip-fetch') skipFetch = true
    else if (arg === '--no-geocode') noGeocode = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--file=')) file = path.resolve(repoRoot, arg.slice('--file='.length))
  }
  return { target, dryRun, file, noPrune, skipFetch, noGeocode }
}

/** Re-export for scripts/tests. */
export { loadCatalogSeedFiles } from './lib/pokerTournamentCatalog.mjs'

/** @param {string} html */
function parseWynnJsonLdEvents(html) {
  /** @type {object[]} */
  const events = []
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1])
      const graph = parsed['@graph'] || (parsed['@type'] === 'Event' ? [parsed] : [])
      for (const node of graph) {
        if (node?.['@type'] === 'Event') events.push(node)
      }
    } catch {
      /* ignore malformed blocks */
    }
  }
  return events
}

/**
 * @param {object[]} schemaEvents
 * @param {Date} now
 */
export function wynnSchemaEventsToOneOff(schemaEvents, now = new Date()) {
  const today = isoDateLocal(now)
  /** @type {object[]} */
  const oneOff = []

  for (const ev of schemaEvents || []) {
    const endDate = String(ev.endDate || ev.startDate || '').slice(0, 10)
    if (!endDate || endDate < today) continue

    const name = String(ev.name || '').trim()
    const venueRaw = ev.location?.name || 'Wynn Las Vegas'
    const buyIn = parseBuyInFromText(name, ev.description)
    if (!name || buyIn == null) continue

    const startDate = String(ev.startDate || today).slice(0, 10)
    oneOff.push({
      external_id: `wynn-series:${slugify(name)}:${startDate}`,
      venue_name: normalizeCatalogVenueName(venueRaw),
      event_date: startDate,
      buy_in: buyIn,
      game_variant: 'nl hold\'em',
      display_name: name,
    })
  }

  return oneOff
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

async function fetchWynnOneOffEvents() {
  const res = await fetch(WYNN_URL, { headers: { 'User-Agent': FETCH_UA } })
  if (!res.ok) throw new Error(`Wynn fetch failed: HTTP ${res.status}`)
  const html = await res.text()
  return wynnSchemaEventsToOneOff(parseWynnJsonLdEvents(html))
}

async function main() {
  const { target, dryRun, file, noPrune, skipFetch, noGeocode } = parseArgs(process.argv)
  loadSupabaseEnv(target)

  const { paths, payloads } = loadCatalogSeedFiles(file)
  if (!payloads.length) {
    console.error('No catalog seed files found.')
    process.exit(1)
  }

  const lvPayload = payloads.find((p) => String(p?._meta?.region || '') === 'las-vegas')
  const mttdbPayload = payloads.find((p) => String(p?._meta?.region || '') === 'mttdb')

  if (!skipFetch && lvPayload) {
    try {
      const fetchedOneOff = await fetchWynnOneOffEvents()
      lvPayload.one_off = dedupeCatalogRows([...(lvPayload.one_off || []), ...fetchedOneOff])
      console.log(`Fetched ${fetchedOneOff.length} Wynn series event(s) from JSON-LD`)
    } catch (err) {
      console.warn('[poker:catalog:sync] Wynn fetch skipped:', err?.message || err)
    }
  }
  if (!skipFetch && mttdbPayload) {
    try {
      const supabase = createSupabaseServiceClient(createClient)
      const venueResolver = await createMttdbVenueResolver(supabase, {
        dryRun,
        geocode: !noGeocode && !dryRun,
      })
      const siteResolver = createMttdbSiteResolver()

      const { oneOff: liveOneOff, stats: liveStats } = await fetchMttdbLiveCatalogOneOffs({
        resolveVenue: venueResolver.resolve,
      })
      console.log(
        `MTTDB live: parsed ${liveStats.parsed}, ingested ${liveStats.ingested} (skipped satellites ${liveStats.skippedSatellites}, venue ${liveStats.skippedVenue}, date ${liveStats.skippedDate})`,
      )
      const unmappedVenues = venueResolver.unmappedVenues()
      if (unmappedVenues.length) {
        console.log(`MTTDB unmapped venues (${unmappedVenues.length}):`)
        for (const v of unmappedVenues.slice(0, 25)) {
          console.log(`  - ${v.venue_title} | ${v.venue_city || '?'} | ${v.country_name || '?'}`)
        }
        if (unmappedVenues.length > 25) console.log(`  … +${unmappedVenues.length - 25} more`)
      }

      const { oneOff: onlineOneOff, stats: onlineStats } = await fetchMttdbOnlineCatalogOneOffs({
        resolveSite: siteResolver.resolve,
      })
      console.log(
        `MTTDB online: parsed ${onlineStats.parsed}, ingested ${onlineStats.ingested} (skipped satellites ${onlineStats.skippedSatellites}, site ${onlineStats.skippedSite}, date ${onlineStats.skippedDate})`,
      )
      const unmappedSites = siteResolver.unmappedSites()
      if (unmappedSites.length) {
        console.log(`MTTDB unmapped online sites (${unmappedSites.length}):`)
        for (const s of unmappedSites.slice(0, 25)) {
          console.log(`  - ${s.site_slug || '?'} | ${s.site_name || '?'}`)
        }
        if (unmappedSites.length > 25) console.log(`  … +${unmappedSites.length - 25} more`)
      }

      mttdbPayload.one_off = dedupeCatalogRows([...liveOneOff, ...onlineOneOff])
    } catch (err) {
      console.warn('[poker:catalog:sync] MTTDB fetch skipped:', err?.message || err)
    }
  }

  const rows = buildCatalogUpsertRowsFromPayloads(payloads)
  if (!rows.length) {
    console.error('No catalog rows to upsert.')
    process.exit(1)
  }

  console.log(`Target: ${targetHuman(target)}`)
  console.log(`Files: ${paths.map((p) => path.relative(repoRoot, p)).join(', ')}`)
  console.log(`Rows: ${rows.length}${dryRun ? ' (dry run)' : ''}`)

  if (dryRun) {
    const mttdbSamples = rows.filter((r) => String(r.external_id || '').startsWith('mttdb:')).slice(0, 8)
    for (const row of mttdbSamples.length ? mttdbSamples : rows.slice(0, 8)) {
      console.log(
        '  sample:',
        row.external_id,
        row.event_date,
        row.starts_at || '—',
        row.venue_name,
        row.buy_in,
        row.display_name,
      )
    }
    if (rows.length > 8) console.log(`  … +${rows.length - 8} more`)
    return
  }

  const supabase = createSupabaseServiceClient(createClient)
  const { data, error } = await supabase.rpc('upsert_poker_tournament_catalog', {
    p_rows: rows,
    p_prune_past: !noPrune,
  })

  if (error) {
    console.error('upsert_poker_tournament_catalog failed:', error.message)
    process.exit(1)
  }

  console.log('Done:', data)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
