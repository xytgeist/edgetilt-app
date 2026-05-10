import fs from 'node:fs'
import path from 'node:path'

function parseCsv(text) {
  const rows = []
  let i = 0
  let field = ''
  let row = []
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    if (row.length === 1 && row[0] === '') return
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (ch === ',') {
      pushField()
      i += 1
      continue
    }

    if (ch === '\r') {
      i += 1
      continue
    }

    if (ch === '\n') {
      pushField()
      pushRow()
      i += 1
      continue
    }

    field += ch
    i += 1
  }

  pushField()
  pushRow()

  if (rows.length === 0) return { header: [], records: [] }
  const header = rows[0].map((h) => h.trim())
  const records = rows.slice(1).map((r) => {
    const obj = {}
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim()
    })
    return obj
  })
  return { header, records }
}

function csvEscape(s) {
  const str = String(s ?? '')
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function normalize(s) {
  return String(s || '').trim()
}

function titleCaseCity(s) {
  const t = normalize(s)
  if (!t) return ''
  // Keep basic capitalization; don't over-normalize
  return t
}

function normalizeNvMetroCity(city, region) {
  const c = normalize(city)
  const r = normalize(region)
  if (r.toUpperCase() !== 'NV') return c

  const lower = c.toLowerCase()
  // Keep Reno separate (different market)
  if (lower === 'reno') return 'Reno'

  // Collapse Vegas metro sub-cities into Las Vegas
  const vegasMetro = new Set([
    'las vegas',
    'north las vegas',
    'henderson',
    'paradise',
    'winchester',
    'spring valley',
    'enterprise',
    'summerlin',
    'summerlin south',
    'whitney',
    'sunrise manor',
    'boulder city'
  ])
  if (!c || vegasMetro.has(lower)) return 'Las Vegas'
  return c
}

function cityKey({ name, region }) {
  return `${normalize(name).toLowerCase()}|${normalize(region).toLowerCase()}`
}

function casinoKey({ city_name, city_region, casino_name }) {
  return `${normalize(city_name).toLowerCase()}|${normalize(city_region).toLowerCase()}|${normalize(casino_name).toLowerCase()}`
}

function readMaybeCsv(filePath, expectedHeader) {
  if (!fs.existsSync(filePath)) return []
  const { records } = parseCsv(fs.readFileSync(filePath, 'utf8'))
  if (expectedHeader) {
    // Best-effort: only keep matching keys
    return records.map((r) => {
      const obj = {}
      expectedHeader.forEach((k) => (obj[k] = normalize(r[k])))
      return obj
    })
  }
  return records
}

function writeCitiesCsv(filePath, cities) {
  const lines = ['name,region']
  for (const c of cities) {
    lines.push([csvEscape(c.name), csvEscape(c.region)].join(','))
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

function writeCasinosCsv(filePath, casinos) {
  const lines = ['city_name,city_region,casino_name']
  for (const c of casinos) {
    lines.push([csvEscape(c.city_name), csvEscape(c.city_region), csvEscape(c.casino_name)].join(','))
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

function main() {
  const geojsonPath = process.argv[2]
  if (!geojsonPath) {
    throw new Error('Usage: node scripts/import-overpass-geojson-to-local-intel-csv.mjs <path-to-geojson>')
  }

  const root = process.cwd()
  const absGeo = path.isAbsolute(geojsonPath) ? geojsonPath : path.join(root, geojsonPath)
  const seedDir = path.join(root, 'supabase', 'seed')
  const citiesCsvPath = path.join(seedDir, 'cities.csv')
  const casinosCsvPath = path.join(seedDir, 'casinos.csv')

  const raw = fs.readFileSync(absGeo, 'utf8')
  const geo = JSON.parse(raw)
  const features = Array.isArray(geo?.features) ? geo.features : []

  const importedCasinos = []
  for (const f of features) {
    const props = f?.properties || {}
    const name = normalize(props.name)
    if (!name) continue

    const rawCity = titleCaseCity(props['addr:city'] || props['addr:suburb'] || 'Las Vegas')
    const region = normalize(props['addr:state'] || 'NV')
    const city = normalizeNvMetroCity(rawCity, region)

    // Skip non-US state codes if present
    if (region.length > 2) continue

    importedCasinos.push({ city_name: city || 'Las Vegas', city_region: region || 'NV', casino_name: name })
  }

  const existingCities = readMaybeCsv(citiesCsvPath, ['name', 'region'])
  const existingCasinos = readMaybeCsv(casinosCsvPath, ['city_name', 'city_region', 'casino_name'])

  const cityMap = new Map()
  for (const c of existingCities) {
    const region = normalize(c.region)
    const name = normalizeNvMetroCity(c.name, region)
    if (!name) continue
    cityMap.set(cityKey({ name, region }), { name, region })
  }

  const casinoMap = new Map()
  for (const c of existingCasinos) {
    const region = normalize(c.city_region)
    const city = normalizeNvMetroCity(c.city_name, region)
    const casinoName = normalize(c.casino_name)
    if (!city || !casinoName) continue
    const normalized = { city_name: city, city_region: region, casino_name: casinoName }
    casinoMap.set(casinoKey(normalized), normalized)
  }

  for (const c of importedCasinos) {
    cityMap.set(cityKey({ name: c.city_name, region: c.city_region }), { name: c.city_name, region: c.city_region })
    casinoMap.set(casinoKey(c), c)
  }

  const cities = [...cityMap.values()].sort((a, b) => (a.region || '').localeCompare(b.region || '') || a.name.localeCompare(b.name))
  const casinos = [...casinoMap.values()].sort((a, b) => {
    const c = (a.city_region || '').localeCompare(b.city_region || '')
    if (c) return c
    const d = (a.city_name || '').localeCompare(b.city_name || '')
    if (d) return d
    return (a.casino_name || '').localeCompare(b.casino_name || '')
  })

  fs.mkdirSync(seedDir, { recursive: true })
  writeCitiesCsv(citiesCsvPath, cities)
  writeCasinosCsv(casinosCsvPath, casinos)

  console.log(
    `Imported ${importedCasinos.length} rows from GeoJSON; now ${cities.length} cities and ${casinos.length} casinos in seed CSVs.`
  )
}

main()

