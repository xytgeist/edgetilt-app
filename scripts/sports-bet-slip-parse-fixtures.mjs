/**
 * Heuristic slip-parse fixtures (Ryan's example tickets).
 * Run: node scripts/sports-bet-slip-parse-fixtures.mjs
 */
import { parseSportsBetSlipText } from '../src/features/sports-bet-tracker/sportsBetParse.js'

const fixtures = [
  {
    name: 'Mirage 49ers ML',
    text: `
MIRAGE
00347 8362 85066
Slip ID: 6940650                    74488317
$500,000.00 Straight
Max Payout: $1,100,000.00
101 49ers MLB                    +120
49ers @ Chiefs          2/2/2020 3:30 PM
Ticket Cost $500,000.00
1108  001036  1/29/2020 5:31:00 PM
00347 8362 85066
`,
    expect: {
      book: 'Mirage',
      stake_dollars: 500000,
      market: 'h2h',
      odds: 120,
      selection_includes: '49ers',
      event_includes: 'Chiefs',
      sport_label: 'NFL',
      commence_date: '2020-02-02',
    },
  },
  {
    name: 'Casino Lopez fight',
    text: `
F2C76-E1FF-8055
$6,500.00 Straight Bet
LIGHTWEIGHT TITLE BOUT
2101  LOPEZ T
+310 MLB
10/17/2020
Win $20,150.00 to pay $26,650.00
Ticket Cost $6,500.00
Internal ID: 258044
02485 W004812 Book 17oct2020 20:07:34
F2C76-E1FF-8055
`,
    expect: {
      book: '',
      stake_dollars: 6500,
      market: 'h2h',
      odds: 310,
      selection_includes: 'Lopez',
      sport_label: 'Boxing',
      sport_key: 'boxing_boxing',
    },
  },
  {
    name: 'Fliff Cousins prop',
    text: `
Pick Submitted
NFL | Oct 18, 4:25 pm
Kirk Cousins Over 4.5                    +3685
PASSING TOUCHDOWNS
BUF Bills vs LV Raiders
Risk: 50.00
Payout: 1,892.50
COPY TO FLIFF COINS
`,
    expect: {
      book: 'Fliff',
      stake_dollars: 50,
      market: 'prop',
      odds: 3685,
      selection_includes: 'Passing',
      player_name: 'Kirk Cousins',
      event_includes: 'Raiders',
      sport_label: 'NFL',
    },
  },
  {
    name: 'Alvarez fight distance',
    text: `
Straight Bet
Yes
Fight To Go The Distance
C. Alvarez vs W. Scull
05/03/25, 11:55 PM                    +135
Total Odds                              +135
Wager                              $9464.00
Potential Payout                  $22240.40
Printed by HWHR-TEL-001
Ticket 568089239281249199
`,
    expect: {
      book: '',
      stake_dollars: 9464,
      market: 'other',
      odds: 135,
      selection_includes: 'Distance',
      event_includes: 'Alvarez',
      sport_label: 'Boxing',
      sport_key: 'boxing_boxing',
    },
  },
  {
    name: 'Barstool Bills spread',
    text: `
BARSTOOL SPORTSBOOK
Betslip no. XXXXX
Transaction Date & Time: January 22, 2021, 4:23:01 PM
Terminal GTC-OTC04
Single
Point Spread: BUF Bills +3.5
Wager                              $420,420.00
Potential Payout                   $781,981.20
1007254346
BUF Bills @ KC Chiefs
Football / NFL
January 24, 2021, 6:40:00 PM
Point Spread
BUF Bills +3.5                              -117
Terms and conditions apply.
555 E Lafayette St
Detroit, MI 48226
`,
    expect: {
      book: 'Barstool',
      stake_dollars: 420420,
      market: 'spread',
      odds: -117,
      selection_includes: 'Bills',
      event_includes: 'Chiefs',
      sport_label: 'NFL',
      commence_date: '2021-01-24',
    },
  },
  {
    name: 'Circa Poirier',
    text: `
Circa RESORT & CASINO
8 FREMONT STREET LAS VEGAS, NV 89101
ACCOUNT #30000416641
F881B05EF470
STRAIGHT BET
1 BET(S) @ $50,000.00
Jul 10 2021
UFC - FIGHT WINNER/TOTAL ROUNDS
UFC 264: MAIN EVENT - POIRIER/MCGREGOR
[24901] D POIRIER                              -140
TO WIN: $35,714.30
TO COLLECT: $85,714.30
TICKET COST: $50,000.00
GG3381  CIRCA313  F881B05EF470
Jul 10 2021 20:27:51
`,
    expect: {
      book: 'Circa',
      stake_dollars: 50000,
      market: 'h2h',
      odds: -140,
      selection_includes: 'Poirier',
      event_includes: 'POIRIER',
      sport_label: 'UFC',
      sport_key: 'mma_mixed_martial_arts',
      away_team: 'POIRIER',
      home_team: 'MCGREGOR',
      side: 'away',
    },
  },
  {
    name: 'Barstool UFC name above odds',
    text: `
BARSTOOL SPORTSBOOK
MAIN EVENT - POIRIER/MCGREGOR
UFC 303
D Poirier
-145
Risk $50.00
`,
    expect: {
      book: 'Barstool',
      stake_dollars: 50,
      market: 'h2h',
      odds: -145,
      selection_includes: 'Poirier',
      sport_label: 'UFC',
      sport_key: 'mma_mixed_martial_arts',
      away_team: 'POIRIER',
      home_team: 'MCGREGOR',
      side: 'away',
    },
  },
  {
    name: '2-leg parlay',
    text: `
2 Leg Parlay
BUF Bills +3.5                              -110
KC Chiefs ML                                -150
Total Odds                                  +250
Wager                              $50.00
Potential Payout                   $175.00
Football / NFL
`,
    expect: {
      market: 'parlay',
      stake_dollars: 50,
      odds: 250,
      selection_includes: 'Parlay',
      legs: 2,
    },
  },
]

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

let failed = 0
for (const fx of fixtures) {
  try {
    const drafts = parseSportsBetSlipText(fx.text)
    assert(drafts.length === 1, `${fx.name}: expected 1 draft, got ${drafts.length}`)
    const d = drafts[0]
    const e = fx.expect
    if (e.book !== undefined) {
      assert(d.book === e.book, `${fx.name}: book want ${JSON.stringify(e.book)} got ${JSON.stringify(d.book)}`)
    }
    if (e.stake_dollars != null) {
      assert(Number(d.stake_dollars) === e.stake_dollars, `${fx.name}: stake want ${e.stake_dollars} got ${d.stake_dollars}`)
    }
    if (e.market) assert(d.market === e.market, `${fx.name}: market want ${e.market} got ${d.market}`)
    if (e.odds != null) assert(Number(d.odds) === e.odds, `${fx.name}: odds want ${e.odds} got ${d.odds}`)
    if (e.selection_includes) {
      assert(
        String(d.selection_label).toLowerCase().includes(e.selection_includes.toLowerCase()),
        `${fx.name}: selection_label missing ${e.selection_includes}: ${d.selection_label}`,
      )
    }
    if (e.player_name) {
      assert(d.player_name === e.player_name, `${fx.name}: player want ${e.player_name} got ${d.player_name}`)
    }
    if (e.event_includes) {
      const ev = `${d.event_label || ''} ${d.away_team || ''} ${d.home_team || ''}`
      assert(
        ev.toLowerCase().includes(e.event_includes.toLowerCase()),
        `${fx.name}: event missing ${e.event_includes}: ${ev}`,
      )
    }
    if (e.sport_label) {
      assert(d.sport_label === e.sport_label, `${fx.name}: sport want ${e.sport_label} got ${d.sport_label}`)
    }
    if (e.sport_key) {
      assert(d.sport_key === e.sport_key, `${fx.name}: sport_key want ${e.sport_key} got ${d.sport_key}`)
    }
    if (e.away_team != null) {
      assert(d.away_team === e.away_team, `${fx.name}: away_team want ${e.away_team} got ${d.away_team}`)
    }
    if (e.home_team != null) {
      assert(d.home_team === e.home_team, `${fx.name}: home_team want ${e.home_team} got ${d.home_team}`)
    }
    if (e.side != null) {
      assert(d.side === e.side, `${fx.name}: side want ${e.side} got ${d.side}`)
    }
    if (e.legs != null) {
      const n = Array.isArray(d.legs) ? d.legs.length : 0
      assert(n === e.legs, `${fx.name}: legs want ${e.legs} got ${n}`)
    }
    if (e.commence_date) {
      const [y, mo, day] = e.commence_date.split('-').map(Number)
      const dt = new Date(d.commence_time)
      assert(
        !Number.isNaN(dt.getTime())
          && dt.getFullYear() === y
          && dt.getMonth() + 1 === mo
          && dt.getDate() === day,
        `${fx.name}: commence want local ${e.commence_date} got ${d.commence_time}`,
      )
    }
    // Slip dollars must not land in stake_units
    assert(!d.stake_units || Number(d.stake_units) !== e.stake_dollars, `${fx.name}: stake stuffed into units`)
    console.log(`ok  ${fx.name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL ${fx.name}: ${err.message}`)
  }
}

if (failed) {
  console.error(`\n${failed}/${fixtures.length} failed`)
  process.exit(1)
}
console.log(`\n${fixtures.length}/${fixtures.length} passed`)
