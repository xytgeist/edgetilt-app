#!/usr/bin/env node
/**
 * Guards the public SEO landings and free calculators.
 * Fails if a new URL drops out of the sitemap or Vercel rewrites,
 * if guide slug URLs sneak into the sitemap, or if the shared math drifts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  americanToDecimal,
  americanToFractional,
  arbTwoWay,
  clvLinePoints,
  clvPricePoints,
  impliedFromAmerican,
  kellyStake,
  noVigTwoWay,
  parseAnyOdds,
} from '../src/features/sports-bet-tracker/sportsBetCalcMath.js'
import { SEO_PUBLIC_PAGES } from './vite-seo-public-routes.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function fail(message) {
  failures.push(message)
}

function read(rel) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) {
    fail(`missing file ${rel}`)
    return ''
  }
  return fs.readFileSync(abs, 'utf8')
}

function near(actual, expected, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.02) {
    fail(`${label}: expected ${expected}, got ${actual}`)
  }
}

const kelly = kellyStake(1000, '+150', 0.45, 0.5)
near(kelly?.stake, 41.6667, 'half kelly stake')
if (kelly?.noBet) fail('half kelly +150 at 45% should bet')
const noEdge = kellyStake(1000, '-110', 0.3, 1)
if (!noEdge?.noBet) fail('30% at -110 should be a no-bet')

const fair = noVigTwoWay('-110', '-110')
near(fair?.vigPct, 4.7619, 'novig hold')
near(fair?.fairA, 0.5, 'novig fair A')
near(fair?.fairAmericanA, -100, 'novig fair american')

const held = arbTwoWay('-110', '-110', 100)
if (held?.isArb) fail('-110/-110 is not an arb')
near(held?.overround, 1.04762, 'arb overround')
const overlay = arbTwoWay('+110', '+110', 100)
if (!overlay?.isArb) fail('+110/+110 should arb')
near(overlay?.profit, 5, 'arb profit')
near(overlay?.stakeA, 50, 'arb stake A')

if (parseAnyOdds('+150') !== 150) fail('parse +150')
near(americanToDecimal('+150'), 2.5, 'decimal +150')
if (americanToFractional('+150') !== '3/2') fail(`fraction +150 got ${americanToFractional('+150')}`)
near(impliedFromAmerican('+150'), 0.4, 'implied +150')
if (parseAnyOdds('2.50') !== 150) fail('parse 2.50')
if (parseAnyOdds('3/2') !== 150) fail('parse 3/2')

near(clvLinePoints('spread', '', 7, 3), 4, 'spread clv')
near(clvLinePoints('spread', '', -3, -6.5), 3.5, 'favorite spread clv')
near(clvLinePoints('total', 'under', 45, 48), 3, 'under clv')
near(clvLinePoints('total', 'over', 45, 48), -3, 'over clv')
if (clvLinePoints('total', '', 45, 48) != null) fail('total CLV needs a side')
near(clvPricePoints('+150', '+130'), 3.478, 'price clv')

const sitemap = read('public/sitemap.xml')
const robots = read('public/robots.txt')
const vercel = JSON.parse(read('vercel.json') || '{}')
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : []
const catchAll = rewrites.findIndex((row) => String(row.source || '').includes('(?!assets/)'))
if (catchAll < 0) fail('SPA catch-all rewrite missing')
if (!/Allow:\s*\//.test(robots)) fail('robots.txt must allow /')
if (/Disallow:\s*\/(?:calculators|fantasy|sports|slots)\b/.test(robots)) {
  fail('robots.txt disallows a public tool path')
}

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
if (locs.some((loc) => /\/guides\/[^<\s]+/.test(loc) || /guide=/.test(loc))) {
  fail('sitemap lists an AP guide slug')
}
if (locs.some((loc) => /local-intel|\/intel\b/i.test(loc))) fail('sitemap lists Local Intel')

for (const page of SEO_PUBLIC_PAGES) {
  const html = read(page.file)
  const canonical = `https://edgetilt.com${page.path}`
  if (!locs.includes(canonical)) fail(`sitemap missing ${canonical}`)
  const rewriteAt = rewrites.findIndex((row) => row.source === page.path && row.destination === page.rewrite)
  if (rewriteAt < 0) fail(`vercel rewrite missing ${page.path} -> ${page.rewrite}`)
  else if (catchAll >= 0 && rewriteAt > catchAll) fail(`${page.path} rewrite sits after the SPA catch-all`)
  if (!html.includes(`<link rel="canonical" href="${canonical}" />`)) fail(`${page.file} canonical`)
  if (!/<title>[^<]+<\/title>/.test(html)) fail(`${page.file} title`)
  if (!/name="description"/.test(html)) fail(`${page.file} meta description`)
  if (html.includes('\u2014') || html.includes('\u2013')) fail(`${page.file} has a dash that should be words`)
  if (/local intel/i.test(html)) fail(`${page.file} mentions Local Intel`)
  if (/guide=/.test(html) || /content_markdown/.test(html) || /lounge_market_files/.test(html)) {
    fail(`${page.file} exposes a gated guide or market-file path`)
  }
  if (page.kind === 'calculator') {
    if (!html.includes('<form')) fail(`${page.file} calculator has no form`)
    const entry = read(page.entry)
    if (!entry.includes('sportsBetCalcMath.js')) fail(`${page.entry} must import the shared math`)
    if (entry.includes('\u2014')) fail(`${page.entry} has an em dash`)
  } else if (html.includes('data-calc') || html.includes('sports_bets')) {
    fail(`${page.file} landing exposes tracker data`)
  }
}

const css = read('public/seo/base.css')
if (css.includes('\u2014')) fail('public/seo/base.css has an em dash')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`seo public pages ok (${SEO_PUBLIC_PAGES.length} urls, math fixtures matched)`)
