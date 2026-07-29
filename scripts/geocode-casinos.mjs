/**
 * Geocodes all seeded casinos via Google Maps Geocoding API and writes:
 *   - supabase/migrations/20260528120000_casinos_lat_lng.sql  (updated)
 *   - scripts/geocode-casinos-result.csv                      (for review)
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=your_key node scripts/geocode-casinos.mjs
 *
 * Requires Node 18+ (native fetch).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const API_KEY = process.env.GOOGLE_MAPS_API_KEY
if (!API_KEY) {
  console.error('ERROR: Set GOOGLE_MAPS_API_KEY environment variable.')
  process.exit(1)
}

// ── Full casino list ───────────────────────────────────────────────────────────
const CASINOS = [
  // Las Vegas
  { name: 'Bellagio',                          city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Caesars Palace',                    city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'MGM Grand',                         city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'The Venetian',                      city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Wynn Las Vegas',                    city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Encore at Wynn',                    city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Aria Resort & Casino',              city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'The Cosmopolitan',                  city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Resorts World Las Vegas',           city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Planet Hollywood',                  city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Flamingo Las Vegas',                city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Paris Las Vegas',                   city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Treasure Island',                   city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Circus Circus',                     city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Golden Nugget',                     city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'The LINQ',                          city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Park MGM',                          city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'New York-New York',                 city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Excalibur',                         city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Luxor',                             city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Mandalay Bay',                      city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Fontainebleau Las Vegas',           city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Horseshoe Las Vegas',               city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: "Harrah's Las Vegas",                city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Sahara Las Vegas',                  city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'The Strat',                         city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'The Palazzo',                       city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Hard Rock Las Vegas',               city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Rio All-Suite Hotel & Casino',      city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'Palms Casino Resort',               city: 'Las Vegas',           region: 'Nevada, USA' },
  { name: 'South Point',                       city: 'Las Vegas',           region: 'Nevada, USA' },
  // Oklahoma
  { name: 'WinStar World Casino',              city: 'Thackerville',        region: 'Oklahoma, USA' },
  { name: 'Hard Rock Casino',                  city: 'Catoosa',             region: 'Oklahoma, USA' },
  { name: 'Choctaw Casino & Resort',           city: 'Durant',              region: 'Oklahoma, USA' },
  { name: 'Cherokee Casino',                   city: 'West Siloam Springs', region: 'Oklahoma, USA' },
  { name: 'Riverwind Casino',                  city: 'Norman',              region: 'Oklahoma, USA' },
  { name: 'Kickapoo Casino',                   city: 'Shawnee',             region: 'Oklahoma, USA' },
  { name: 'Comanche Nation Casino',            city: 'Lawton',              region: 'Oklahoma, USA' },
  { name: 'Chickasaw Casino',                  city: 'Ardmore',             region: 'Oklahoma, USA' },
  { name: 'Gold River Casino',                 city: 'Pauls Valley',        region: 'Oklahoma, USA' },
  { name: '7 Clans First Council Casino',      city: 'Newkirk',             region: 'Oklahoma, USA' },
  { name: 'Apache Casino Hotel',               city: 'Lawton',              region: 'Oklahoma, USA' },
  // California
  { name: 'Pechanga Resort Casino',            city: 'Temecula',            region: 'California, USA' },
  { name: "Yaamava' Resort & Casino",          city: 'Highland',            region: 'California, USA' },
  { name: 'Thunder Valley Casino Resort',      city: 'Lincoln',             region: 'California, USA' },
  { name: 'Morongo Casino Resort & Spa',       city: 'Cabazon',             region: 'California, USA' },
  { name: 'San Manuel Casino',                 city: 'Highland',            region: 'California, USA' },
  { name: 'Agua Caliente Casino',              city: 'Rancho Mirage',       region: 'California, USA' },
  { name: 'Barona Resort & Casino',            city: 'Lakeside',            region: 'California, USA' },
  { name: 'Viejas Casino',                     city: 'Alpine',              region: 'California, USA' },
  { name: 'Jamul Casino',                      city: 'Jamul',               region: 'California, USA' },
  { name: 'Sycuan Casino Resort',              city: 'El Cajon',            region: 'California, USA' },
  { name: 'Pala Casino Spa Resort',            city: 'Pala',                region: 'California, USA' },
  // Connecticut
  { name: 'Foxwoods Resort Casino',            city: 'Mashantucket',        region: 'Connecticut, USA' },
  { name: 'Mohegan Sun',                       city: 'Uncasville',          region: 'Connecticut, USA' },
  // New Jersey
  { name: 'Borgata Hotel Casino & Spa',        city: 'Atlantic City',       region: 'New Jersey, USA' },
  { name: 'Hard Rock Hotel & Casino',          city: 'Atlantic City',       region: 'New Jersey, USA' },
  { name: 'Ocean Casino Resort',               city: 'Atlantic City',       region: 'New Jersey, USA' },
  // Florida
  { name: 'Seminole Hard Rock Hotel & Casino', city: 'Tampa',               region: 'Florida, USA' },
  // Mississippi
  { name: 'Beau Rivage Resort & Casino',       city: 'Biloxi',              region: 'Mississippi, USA' },
  // Pennsylvania
  { name: 'Parx Casino',                       city: 'Bensalem',            region: 'Pennsylvania, USA' },
  { name: 'Wind Creek Bethlehem',              city: 'Bethlehem',           region: 'Pennsylvania, USA' },
  { name: 'Rivers Casino',                     city: 'Philadelphia',        region: 'Pennsylvania, USA' },
  { name: 'Presque Isle Downs & Casino',       city: 'Erie',                region: 'Pennsylvania, USA' },
  { name: "Harrah's Philadelphia",             city: 'Chester',             region: 'Pennsylvania, USA' },
  { name: 'Live! Casino Pittsburgh',           city: 'Washington',          region: 'Pennsylvania, USA' },
  // Maryland
  { name: 'MGM National Harbor',              city: 'Oxon Hill',            region: 'Maryland, USA' },
  { name: 'Live! Casino & Hotel',             city: 'Hanover',              region: 'Maryland, USA' },
  { name: 'Ocean Downs Casino',               city: 'Berlin',               region: 'Maryland, USA' },
  // Indiana
  { name: 'Horseshoe Casino',                  city: 'Hammond',             region: 'Indiana, USA' },
  { name: 'Blue Chip Casino',                  city: 'Michigan City',       region: 'Indiana, USA' },
  { name: 'Belterra Casino',                   city: 'Belterra',            region: 'Indiana, USA' },
  { name: 'French Lick Resort',                city: 'French Lick',         region: 'Indiana, USA' },
  { name: 'Rising Sun Casino',                 city: 'Rising Sun',          region: 'Indiana, USA' },
  // Missouri
  { name: 'Ameristar Casino',                  city: 'St. Charles',         region: 'Missouri, USA' },
  // New York
  { name: 'Turning Stone Resort Casino',       city: 'Verona',              region: 'New York, USA' },
  // North Carolina
  { name: "Harrah's Cherokee Casino Resort",   city: 'Cherokee',            region: 'North Carolina, USA' },
  // Louisiana
  { name: 'Coushatta Casino Resort',           city: 'Kinder',              region: 'Louisiana, USA' },
  { name: "L'Auberge Casino Resort",           city: 'Lake Charles',        region: 'Louisiana, USA' },
  { name: 'Margaritaville Resort Casino',      city: 'Bossier City',        region: 'Louisiana, USA' },
  { name: 'Delta Downs Casino',                city: 'Vinton',              region: 'Louisiana, USA' },
  // Michigan
  { name: 'Soaring Eagle Casino & Resort',     city: 'Mount Pleasant',      region: 'Michigan, USA' },
  { name: 'FireKeepers Casino',                city: 'Battle Creek',        region: 'Michigan, USA' },
  { name: 'Gun Lake Casino',                   city: 'Wayland',             region: 'Michigan, USA' },
  // Wisconsin
  { name: 'Potawatomi Casino Hotel',           city: 'Milwaukee',           region: 'Wisconsin, USA' },
  { name: 'Ho-Chunk Casino',                   city: 'Baraboo',             region: 'Wisconsin, USA' },
  { name: 'Oneida Casino',                     city: 'Green Bay',           region: 'Wisconsin, USA' },
  // Minnesota
  { name: 'Mystic Lake Casino',                city: 'Prior Lake',          region: 'Minnesota, USA' },
  { name: 'Canterbury Park',                   city: 'Shakopee',            region: 'Minnesota, USA' },
  { name: 'Treasure Island Casino',            city: 'Red Wing',            region: 'Minnesota, USA' },
  { name: 'Jackpot Junction Casino',           city: 'Morton',              region: 'Minnesota, USA' },
  // South Dakota
  { name: 'Prairie Edge Casino',               city: 'Watertown',           region: 'South Dakota, USA' },
  { name: 'Deadwood Mountain Grand',           city: 'Deadwood',            region: 'South Dakota, USA' },
  // North Dakota
  { name: 'Four Bears Casino',                 city: 'New Town',            region: 'North Dakota, USA' },
  { name: 'Spirit Lake Casino',                city: 'Fort Totten',         region: 'North Dakota, USA' },
  // Washington
  { name: 'Tulalip Resort Casino',             city: 'Marysville',          region: 'Washington, USA' },
  { name: 'Muckleshoot Casino Resort',         city: 'Auburn',              region: 'Washington, USA' },
  { name: 'Snoqualmie Casino',                 city: 'Snoqualmie',          region: 'Washington, USA' },
  { name: 'Little Creek Casino Resort',        city: 'Shelton',             region: 'Washington, USA' },
  // Iowa
  { name: 'Isle Casino Waterloo',              city: 'Waterloo',            region: 'Iowa, USA' },
  { name: 'Horseshoe Council Bluffs',          city: 'Council Bluffs',      region: 'Iowa, USA' },
  // Illinois
  { name: 'Argosy Casino',                     city: 'Alton',               region: 'Illinois, USA' },
  { name: 'Hollywood Casino',                  city: 'Aurora',              region: 'Illinois, USA' },
  // West Virginia
  { name: 'Mountaineer Casino',                city: 'New Cumberland',      region: 'West Virginia, USA' },
  // Ohio
  { name: 'Jack Cleveland Casino',             city: 'Cleveland',           region: 'Ohio, USA' },
  { name: 'MGM Northfield Park',               city: 'Northfield',          region: 'Ohio, USA' },
  // Alabama
  { name: 'Wind Creek Atmore',                 city: 'Atmore',              region: 'Alabama, USA' },
  { name: 'Wind Creek Montgomery',             city: 'Montgomery',          region: 'Alabama, USA' },
  // Arizona
  { name: 'Talking Stick Resort',              city: 'Scottsdale',          region: 'Arizona, USA' },
  { name: 'Casino Arizona',                    city: 'Scottsdale',          region: 'Arizona, USA' },
  { name: "Harrah's Ak-Chin Casino",           city: 'Maricopa',            region: 'Arizona, USA' },
  { name: 'Desert Diamond Casino',             city: 'Tucson',              region: 'Arizona, USA' },
  { name: 'Casino Del Sol',                    city: 'Tucson',              region: 'Arizona, USA' },
  // Europe
  { name: 'Casino de Monte-Carlo',             city: 'Monte Carlo',         region: 'Monaco' },
  { name: 'Grand Casino de Monte-Carlo',       city: 'Monte Carlo',         region: 'Monaco' },
  { name: 'Casino Baden-Baden',                city: 'Baden-Baden',         region: 'Germany' },
  { name: 'Casino Wiesbaden',                  city: 'Wiesbaden',           region: 'Germany' },
  { name: 'Casino Hohensyburg',                city: 'Dortmund',            region: 'Germany' },
  { name: 'Spielbank Berlin',                  city: 'Berlin',              region: 'Germany' },
  { name: 'Spielbank Hamburg',                 city: 'Hamburg',             region: 'Germany' },
  { name: 'Casino Estoril',                    city: 'Estoril',             region: 'Portugal' },
  { name: 'Casino Lisboa',                     city: 'Lisbon',              region: 'Portugal' },
  { name: 'Casino do Estoril',                 city: 'Estoril',             region: 'Portugal' },
  { name: 'Casino de Marbella',                city: 'Marbella',            region: 'Spain' },
  { name: 'Casino de Barcelona',               city: 'Barcelona',           region: 'Spain' },
  { name: 'Gran Casino de Madrid',             city: 'Madrid',              region: 'Spain' },
  { name: 'Casino de Santander',               city: 'Santander',           region: 'Spain' },
  { name: "Casino Campione",                   city: "Campione d'Italia",   region: 'Italy' },
  { name: 'Casino di Venezia',                 city: 'Venice',              region: 'Italy' },
  { name: 'Casino di Sanremo',                 city: 'Sanremo',             region: 'Italy' },
  { name: 'Casino di Saint-Vincent',           city: 'Saint-Vincent',       region: 'Italy' },
  { name: 'Casino de Deauville',               city: 'Deauville',           region: 'France' },
  { name: 'Casino Barrière Enghien-les-Bains', city: 'Enghien-les-Bains',  region: 'France' },
  { name: 'Casino Barrière Deauville',         city: 'Deauville',           region: 'France' },
  { name: 'Empire Casino',                     city: 'London',              region: 'United Kingdom' },
  { name: 'The Hippodrome Casino',             city: 'London',              region: 'United Kingdom' },
  { name: 'Aspers Casino',                     city: 'London',              region: 'United Kingdom' },
  { name: 'Grosvenor Casino',                  city: 'London',              region: 'United Kingdom' },
  { name: 'Casino Admiral',                    city: 'Prague',              region: 'Czech Republic' },
  { name: 'Casino Corinthia',                  city: 'Prague',              region: 'Czech Republic' },
  { name: 'Casino Royale',                     city: 'Riga',                region: 'Latvia' },
  { name: 'Olympic Casino',                    city: 'Tallinn',             region: 'Estonia' },
  { name: 'Casino Helsinki',                   city: 'Helsinki',            region: 'Finland' },
  { name: 'Casino Cosmopol',                   city: 'Stockholm',           region: 'Sweden' },
  { name: 'Grand Casino Liechtenstein',        city: 'Bendern',             region: 'Liechtenstein' },
  { name: 'Casino Kursaal Interlaken',         city: 'Interlaken',          region: 'Switzerland' },
  { name: 'Casino Lugano',                     city: 'Lugano',              region: 'Switzerland' },
  { name: 'Casino Bern',                       city: 'Bern',                region: 'Switzerland' },
  { name: 'Casino Baden',                      city: 'Baden',               region: 'Switzerland' },
  { name: 'Casino Vienna',                     city: 'Vienna',              region: 'Austria' },
  { name: 'Casino Salzburg',                   city: 'Salzburg',            region: 'Austria' },
  { name: 'Casino Innsbruck',                  city: 'Innsbruck',           region: 'Austria' },
  { name: 'Casino Graz',                       city: 'Graz',                region: 'Austria' },
  // Australia
  { name: 'Crown Melbourne',                   city: 'Southbank',           region: 'Victoria, Australia' },
  { name: 'The Star Sydney',                   city: 'Sydney',              region: 'New South Wales, Australia' },
  { name: 'Crown Sydney',                      city: 'Sydney',              region: 'New South Wales, Australia' },
  { name: 'Crown Perth',                       city: 'Burswood',            region: 'Western Australia, Australia' },
  { name: 'The Star Gold Coast',               city: 'Broadbeach',          region: 'Queensland, Australia' },
  { name: 'The Star Brisbane',                 city: 'Brisbane',            region: 'Queensland, Australia' },
  { name: 'Treasury Casino',                   city: 'Brisbane',            region: 'Queensland, Australia' },
  { name: 'The Reef Hotel Casino',             city: 'Cairns',              region: 'Queensland, Australia' },
  { name: 'The Ville Resort-Casino',           city: 'Townsville',          region: 'Queensland, Australia' },
  { name: 'SkyCity Adelaide',                  city: 'Adelaide',            region: 'South Australia, Australia' },
  { name: 'Casino Canberra',                   city: 'Canberra',            region: 'ACT, Australia' },
  { name: 'Mindil Beach Casino Resort',        city: 'Darwin',              region: 'Northern Territory, Australia' },
  { name: 'Lasseters Hotel Casino',            city: 'Alice Springs',       region: 'Northern Territory, Australia' },
  { name: 'Crown Towers Melbourne',            city: 'Southbank',           region: 'Victoria, Australia' },
  // Asia
  { name: 'The Venetian Macao',                city: 'Macau',               region: 'Macau' },
  { name: 'Wynn Palace',                       city: 'Macau',               region: 'Macau' },
  { name: 'MGM Cotai',                         city: 'Macau',               region: 'Macau' },
  { name: 'City of Dreams',                    city: 'Macau',               region: 'Macau' },
  { name: 'Galaxy Macau',                      city: 'Macau',               region: 'Macau' },
  { name: 'Sands Cotai Central',               city: 'Macau',               region: 'Macau' },
  { name: 'Wynn Macau',                        city: 'Macau',               region: 'Macau' },
  { name: 'Sands Macao',                       city: 'Macau',               region: 'Macau' },
  { name: 'MGM Macau',                         city: 'Macau',               region: 'Macau' },
  { name: 'Grand Lisboa',                      city: 'Macau',               region: 'Macau' },
  { name: 'Marina Bay Sands',                  city: 'Singapore',           region: 'Singapore' },
  { name: 'Resorts World Sentosa',             city: 'Singapore',           region: 'Singapore' },
  { name: 'Solaire Resort & Casino',           city: 'Manila',              region: 'Philippines' },
  { name: 'City of Dreams Manila',             city: 'Manila',              region: 'Philippines' },
  { name: 'Okada Manila',                      city: 'Manila',              region: 'Philippines' },
  { name: 'Resorts World Manila',              city: 'Manila',              region: 'Philippines' },
  { name: 'Hard Rock Hotel Casino Manila',     city: 'Manila',              region: 'Philippines' },
  { name: 'Jeju Shinhwa World',                city: 'Jeju',                region: 'South Korea' },
  { name: 'Paradise City',                     city: 'Incheon',             region: 'South Korea' },
  { name: 'Grand Walkerhill Casino',           city: 'Seoul',               region: 'South Korea' },
  { name: 'NagaWorld',                         city: 'Phnom Penh',          region: 'Cambodia' },
  { name: 'Naga2',                             city: 'Phnom Penh',          region: 'Cambodia' },
  { name: 'Star Vegas',                        city: 'Poipet',              region: 'Cambodia' },
]

// ── Geocode ────────────────────────────────────────────────────────────────────

async function geocode(casino) {
  const query = encodeURIComponent(`${casino.name} ${casino.city} ${casino.region}`)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${API_KEY}`
  const res = await fetch(url)
  const json = await res.json()
  if (json.status !== 'OK' || !json.results?.length) {
    return { lat: null, lng: null, formatted: null, status: json.status }
  }
  const { lat, lng } = json.results[0].geometry.location
  return { lat, lng, formatted: json.results[0].formatted_address, status: 'OK' }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function sqlEscape(str) { return str.replace(/'/g, "''") }

// ── Main ───────────────────────────────────────────────────────────────────────

const results = []
console.log(`Geocoding ${CASINOS.length} casinos...\n`)

for (let i = 0; i < CASINOS.length; i++) {
  const casino = CASINOS[i]
  process.stdout.write(`[${String(i + 1).padStart(3)}/${CASINOS.length}] ${casino.name}...`)
  const geo = await geocode(casino)
  results.push({ ...casino, ...geo })
  if (geo.status === 'OK') {
    process.stdout.write(` ✓ ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}\n`)
  } else {
    process.stdout.write(` ✗ ${geo.status}\n`)
  }
  await sleep(50) // ~20 req/s, well within quota
}

// ── Write SQL migration ────────────────────────────────────────────────────────

const sqlRows = results
  .filter(r => r.lat !== null)
  .map(r => `  ('${sqlEscape(r.name)}', ${r.lat}, ${r.lng})`)
  .join(',\n')

const sql = `-- Auto-generated by scripts/geocode-casinos.mjs via Google Maps Geocoding API
-- Safe to re-run.

alter table public.casinos add column if not exists lat double precision;
alter table public.casinos add column if not exists lng double precision;

create index if not exists casinos_lat_lng_idx on public.casinos (lat, lng)
  where lat is not null and lng is not null;

update public.casinos as c
set lat = v.lat, lng = v.lng
from (values
${sqlRows}
) as v(name, lat, lng)
where lower(c.name) = lower(v.name);
`

const sqlPath = path.join(ROOT, 'supabase', 'migrations', '20260528120000_casinos_lat_lng.sql')
fs.writeFileSync(sqlPath, sql)
console.log(`\n✓ SQL written to ${sqlPath}`)

// ── Write CSV for review ───────────────────────────────────────────────────────

const csvLines = [
  'Casino Name,City,Region,Lat,Lng,Google Formatted Address,Status',
  ...results.map(r =>
    `"${r.name}","${r.city}","${r.region}",${r.lat ?? ''},${r.lng ?? ''},"${r.formatted ?? ''}",${r.status}`
  )
]

const csvPath = path.join(__dirname, 'geocode-casinos-result.csv')
fs.writeFileSync(csvPath, csvLines.join('\n'))
console.log(`✓ CSV written to ${csvPath}`)

const failed = results.filter(r => r.lat === null)
if (failed.length) {
  console.log(`\n⚠ ${failed.length} failed to geocode:`)
  failed.forEach(r => console.log(`  - ${r.name} (${r.status})`))
}

console.log('\nDone.')
