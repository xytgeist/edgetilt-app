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
import {
  fetchClubwptCatalogOneOffs,
  fetchClubwptGoldCatalogOneOffs,
} from './lib/clubwptCatalogFetch.mjs'
import { createMttdbVenueResolver } from './lib/mttdbCatalogVenues.mjs'
import { createMttdbSiteResolver } from './lib/mttdbCatalogSites.mjs'
import { recordOpsJobHeartbeatForTarget } from './lib/opsJobHeartbeat.mjs'

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
  /** @type {{ liveError: string | null, onlineError: string | null, liveIngested: number, onlineIngested: number, liveParsed: number, onlineParsed: number }} */
  const mttdbFetch = {
    liveError: null,
    onlineError: null,
    liveIngested: 0,
    onlineIngested: 0,
    liveParsed: 0,
    onlineParsed: 0,
  }
  /** @type {{ clubwptError: string | null, clubwptIngested: number, clubwptGoldSkipped: string | null }} */
  const clubwptFetch = {
    clubwptError: null,
    clubwptIngested: 0,
    clubwptGoldSkipped: null,
  }

  if (!skipFetch && !mttdbPayload) {
    console.error('[poker:catalog:sync] Missing poker_tournament_catalog_mttdb.json seed (region=mttdb).')
    process.exit(1)
  }

  if (!skipFetch && mttdbPayload) {
    const supabaseForMttdb = createSupabaseServiceClient(createClient)
    /** @type {object[]} */
    let liveOneOff = []
    /** @type {object[]} */
    let onlineOneOff = []

    // Live + online are independent … a live scrape failure must not skip online.
    try {
      const venueResolver = await createMttdbVenueResolver(supabaseForMttdb, {
        dryRun,
        geocode: !noGeocode && !dryRun,
      })
      const live = await fetchMttdbLiveCatalogOneOffs({
        resolveVenue: venueResolver.resolve,
      })
      liveOneOff = live.oneOff || []
      mttdbFetch.liveParsed = Number(live.stats?.parsed) || 0
      mttdbFetch.liveIngested = Number(live.stats?.ingested) || 0
      console.log(
        `MTTDB live: parsed ${live.stats.parsed}, ingested ${live.stats.ingested} (skipped venue ${live.stats.skippedVenue}, date ${live.stats.skippedDate})`,
      )
      const unmappedVenues = venueResolver.unmappedVenues()
      if (unmappedVenues.length) {
        console.log(`MTTDB unmapped venues (${unmappedVenues.length}):`)
        for (const v of unmappedVenues.slice(0, 25)) {
          console.log(`  - ${v.venue_title} | ${v.venue_city || '?'} | ${v.country_name || '?'}`)
        }
        if (unmappedVenues.length > 25) console.log(`  … +${unmappedVenues.length - 25} more`)
      }
    } catch (err) {
      mttdbFetch.liveError = String(err?.message || err)
      console.error('[poker:catalog:sync] MTTDB live fetch failed:', mttdbFetch.liveError)
    }

    try {
      const siteResolver = createMttdbSiteResolver()
      const online = await fetchMttdbOnlineCatalogOneOffs({
        resolveSite: siteResolver.resolve,
      })
      onlineOneOff = online.oneOff || []
      mttdbFetch.onlineParsed = Number(online.stats?.parsed) || 0
      mttdbFetch.onlineIngested = Number(online.stats?.ingested) || 0
      console.log(
        `MTTDB online: parsed ${online.stats.parsed}, ingested ${online.stats.ingested} (skipped site ${online.stats.skippedSite}, date ${online.stats.skippedDate})`,
      )
      const unmappedSites = siteResolver.unmappedSites()
      if (unmappedSites.length) {
        console.log(`MTTDB unmapped online sites (${unmappedSites.length}):`)
        for (const s of unmappedSites.slice(0, 25)) {
          console.log(`  - ${s.site_slug || '?'} | ${s.site_name || '?'}`)
        }
        if (unmappedSites.length > 25) console.log(`  … +${unmappedSites.length - 25} more`)
      }
    } catch (err) {
      mttdbFetch.onlineError = String(err?.message || err)
      console.error('[poker:catalog:sync] MTTDB online fetch failed:', mttdbFetch.onlineError)
    }

    /** @type {object[]} */
    let clubwptOneOff = []
    try {
      const clubwpt = await fetchClubwptCatalogOneOffs()
      clubwptOneOff = clubwpt.oneOff || []
      clubwptFetch.clubwptIngested = Number(clubwpt.stats?.ingested) || 0
      console.log(
        `ClubWPT online: parsed ${clubwpt.stats.parsed}, ingested ${clubwpt.stats.ingested} (skipped date ${clubwpt.stats.skippedDate}, status ${clubwpt.stats.skippedStatus})`,
      )
    } catch (err) {
      clubwptFetch.clubwptError = String(err?.message || err)
      console.error('[poker:catalog:sync] ClubWPT fetch failed:', clubwptFetch.clubwptError)
    }

    /** @type {object[]} */
    let clubwptGoldOneOff = []
    try {
      const gold = await fetchClubwptGoldCatalogOneOffs()
      clubwptFetch.clubwptGoldSkipped = gold.skippedReason || null
      if (clubwptFetch.clubwptGoldSkipped) {
        console.warn(`[poker:catalog:sync] ClubWPT Gold skipped: ${clubwptFetch.clubwptGoldSkipped}`)
      } else {
        clubwptGoldOneOff = gold.oneOff || []
        console.log(
          `ClubWPT Gold online: parsed ${gold.stats.parsed}, ingested ${gold.stats.ingested} (skipped date ${gold.stats.skippedDate}, status ${gold.stats.skippedStatus})`,
        )
      }
    } catch (err) {
      clubwptFetch.clubwptGoldSkipped = String(err?.message || err)
      console.warn('[poker:catalog:sync] ClubWPT Gold skipped:', clubwptFetch.clubwptGoldSkipped)
    }

    mttdbPayload.one_off = dedupeCatalogRows([
      ...liveOneOff,
      ...onlineOneOff,
      ...clubwptOneOff,
      ...clubwptGoldOneOff,
    ])
  }

  const rows = buildCatalogUpsertRowsFromPayloads(payloads)
  if (!rows.length) {
    console.error('No catalog rows to upsert.')
    process.exit(1)
  }

  const mttdbOnlineRows = rows.filter((r) => String(r.external_id || '').startsWith('mttdb:online:'))
  const mttdbLiveRows = rows.filter((r) => String(r.external_id || '').startsWith('mttdb:live:'))
  const clubwptOnlineRows = rows.filter((r) => String(r.external_id || '').startsWith('clubwpt:online:'))
  const clubwptGoldOnlineRows = rows.filter((r) => String(r.external_id || '').startsWith('clubwptgold:online:'))

  console.log(`Target: ${targetHuman(target)}`)
  console.log(`Files: ${paths.map((p) => path.relative(repoRoot, p)).join(', ')}`)
  console.log(
    `Rows: ${rows.length}${dryRun ? ' (dry run)' : ''} (mttdb live ${mttdbLiveRows.length}, online ${mttdbOnlineRows.length}, clubwpt ${clubwptOnlineRows.length}, clubwpt gold ${clubwptGoldOnlineRows.length})`,
  )

  if (dryRun) {
    const mttdbSamples = rows
      .filter(
        (r) =>
          String(r.external_id || '').startsWith('mttdb:') ||
          String(r.external_id || '').startsWith('clubwpt:'),
      )
      .slice(0, 8)
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
    if (!skipFetch) {
      const mttdbProblems = mttdbFetchProblems(mttdbFetch, mttdbOnlineRows.length)
      if (mttdbProblems.length) {
        console.error('[poker:catalog:sync] MTTDB dry-run would fail:', mttdbProblems.join('; '))
        process.exit(1)
      }
    }
    return
  }

  const supabase = createSupabaseServiceClient(createClient)
  try {
    const { data, error } = await supabase.rpc('upsert_poker_tournament_catalog', {
      p_rows: rows,
      p_prune_past: !noPrune,
    })

    if (error) {
      await recordOpsJobHeartbeatForTarget(supabase, target, 'failed', {
        message: error.message,
        rows: rows.length,
        mttdb: mttdbFetch,
        clubwpt: clubwptFetch,
      })
      console.error('upsert_poker_tournament_catalog failed:', error.message)
      process.exit(1)
    }

    const mttdbProblems = skipFetch ? [] : mttdbFetchProblems(mttdbFetch, mttdbOnlineRows.length)
    if (mttdbProblems.length) {
      await recordOpsJobHeartbeatForTarget(supabase, target, 'failed', {
        message: mttdbProblems.join('; '),
        upsert: data,
        rows: rows.length,
        mttdb: mttdbFetch,
        clubwpt: clubwptFetch,
        mttdbOnlineRows: mttdbOnlineRows.length,
        mttdbLiveRows: mttdbLiveRows.length,
        clubwptOnlineRows: clubwptOnlineRows.length,
        target,
      })
      console.error('[poker:catalog:sync] Upserted regional/partial catalog, but MTTDB check failed:')
      for (const p of mttdbProblems) console.error(`  - ${p}`)
      process.exit(1)
    }

    await recordOpsJobHeartbeatForTarget(supabase, target, 'ok', {
      upsert: data,
      rows: rows.length,
      mttdb: mttdbFetch,
      clubwpt: clubwptFetch,
      mttdbOnlineRows: mttdbOnlineRows.length,
      mttdbLiveRows: mttdbLiveRows.length,
      clubwptOnlineRows: clubwptOnlineRows.length,
      target,
    })
    console.log('Done:', data)
  } catch (err) {
    await recordOpsJobHeartbeatForTarget(supabase, target, 'failed', {
      message: String(err?.message || err),
      rows: rows.length,
      mttdb: mttdbFetch,
      clubwpt: clubwptFetch,
    })
    throw err
  }
}

/**
 * Hard fail conditions for scheduled sync (false-green was swallowing MTTDB outages).
 * @param {{ liveError: string | null, onlineError: string | null, liveIngested: number, onlineIngested: number, onlineParsed: number }} fetch
 * @param {number} onlineRowCount
 */
function mttdbFetchProblems(fetch, onlineRowCount) {
  /** @type {string[]} */
  const problems = []
  if (fetch.onlineError) problems.push(`online scrape error: ${fetch.onlineError}`)
  if (!fetch.onlineError && (fetch.onlineIngested < 1 || onlineRowCount < 1)) {
    problems.push(
      `online ingested ${fetch.onlineIngested} (parsed ${fetch.onlineParsed}, upsert rows ${onlineRowCount})`,
    )
  }
  if (fetch.liveError) {
    // Live failure is logged in detail; do not block online success.
    console.warn('[poker:catalog:sync] MTTDB live scrape failed (online still required):', fetch.liveError)
  }
  return problems
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
