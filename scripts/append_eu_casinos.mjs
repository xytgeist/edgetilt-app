import { readFileSync, writeFileSync } from 'fs'

const csv = readFileSync('C:/Users/Ryan Franklin/Downloads/eu_casinos.csv', 'utf8')
const lines = csv.split('\n').slice(1).filter(l => l.trim())

const seen = new Set()
const names = []
for (const line of lines) {
  const name = line.split(',')[0].trim().replace(/'/g, "''")
  const key = name.toLowerCase()
  if (!seen.has(key)) { seen.add(key); names.push(name) }
}

const sql = `-- European casinos
insert into public.casinos (name, source)
values
${names.map(n => `  ('${n}', 'seed')`).join(',\n')}
on conflict (lower(name)) do nothing;
`

const existing = readFileSync('supabase/casino_seed.sql', 'utf8')
writeFileSync('supabase/casino_seed.sql', existing.trimEnd() + '\n\n' + sql)
console.log(`Appended ${names.length} European casinos (${lines.length - names.length} dupes removed)`)
