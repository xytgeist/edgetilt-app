/**
 * Heuristic slip-parse fixtures (Ryan's example tickets).
 * Run: node scripts/sports-bet-slip-parse-fixtures.mjs
 *
 * Vision-OCR batch texts live in scripts/fixtures/sports-bet-slips/*.ocr.txt
 * … re-run after each parser change so prior slips stay green.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  declaredParlayLegCount,
  hydrateParlayLegsForDraft,
  isWeakSportsBetDraft,
  legSelectionLooksJunk,
  parseSportsBetSlipText,
} from '../src/features/sports-bet-tracker/sportsBetParse.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OCR_DIR = path.join(HERE, 'fixtures/sports-bet-slips')

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
      selection_includes: '49ers ML',
      selection_includes_odds: '+120',
      selection_includes_stake: '$500,000',
      event_includes: 'Chiefs',
      event_label: '49ers @ Chiefs',
      sport_label: 'NFL',
      commence_date: '2020-02-02',
    },
  },
  {
    name: 'Mirage OCR collapsed @',
    text: `
MIRAGE
$500,000.00 Straight
101 49ers MLB                    +120
49ers@Chiefs 2/2/2020 3:30 PM
Ticket Cost $500,000.00
`,
    expect: {
      book: 'Mirage',
      stake_dollars: 500000,
      market: 'h2h',
      odds: 120,
      event_label: '49ers @ Chiefs',
      event_includes: 'Chiefs',
      sport_label: 'NFL',
      commence_date: '2020-02-02',
    },
  },
  {
    name: 'Mirage OCR asymmetric @ space',
    text: `
MIRAGE
$500,000.00 Straight
101 49ers MLB                    +120
49ers@ Chiefs 2/2/2020 3:30 PM
Ticket Cost $500,000.00
`,
    expect: {
      book: 'Mirage',
      event_label: '49ers @ Chiefs',
      event_includes: 'Chiefs',
      sport_label: 'NFL',
      commence_date: '2020-02-02',
    },
  },
  {
    name: 'Mirage OCR @ before home only',
    text: `
MIRAGE
$500,000.00 Straight
101 49ers MLB                    +120
49ers @Chiefs 2/2/2020 3:30 PM
Ticket Cost $500,000.00
`,
    expect: {
      book: 'Mirage',
      event_label: '49ers @ Chiefs',
      event_includes: 'Chiefs',
      sport_label: 'NFL',
    },
  },
  {
    name: 'Mirage OCR trademark glue + split @ line',
    text: `
MIRAGE
$500,000.00 Straight
101 49ers MLB                    +120
49ers®
@ Chiefs          2/2/2020 3:30 PM
Ticket Cost $500,000.00
`,
    expect: {
      book: 'Mirage',
      event_label: '49ers @ Chiefs',
      event_includes: 'Chiefs',
      sport_label: 'NFL',
      commence_date: '2020-02-02',
    },
  },
  {
    name: 'Mirage OCR dropped @ nicknames + date',
    text: `
MIRAGE
$500,000.00 Straight
101 49ers MLB                    +120
49ers Chiefs          2/2/2020 3:30 PM
Ticket Cost $500,000.00
`,
    expect: {
      book: 'Mirage',
      event_label: '49ers @ Chiefs',
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
Event Date 10/17/2020
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
      odds_string: '+310',
      selection_includes: 'Lopez',
      sport_label: 'Boxing',
      sport_key: 'boxing_boxing',
      commence_date: '2020-10-17',
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
      // Yes/No distance … not a fighter side (UI shows N/A)
      side: '',
    },
  },
  {
    name: 'UFC under rounds by KO',
    text: `
Straight Bet
Under 3.5 Rounds by Knockout
D Poirier vs C McGregor
UFC 303
+240
Wager                              $100.00
`,
    expect: {
      market: 'total',
      side: 'under',
      odds: 240,
      stake_dollars: 100,
      selection_includes: 'Rounds',
      selection_includes_method: 'KO',
      sport_label: 'UFC',
      event_includes: 'Poirier',
    },
  },
  {
    name: 'Boxing method of victory KO/TKO',
    text: `
Straight Bet
Method of Victory
KO/TKO
C. Alvarez vs W. Scull
+155
Wager                              $200.00
`,
    expect: {
      market: 'other',
      side: '',
      odds: 155,
      selection_includes: 'KO',
      event_includes: 'Alvarez',
      sport_label: 'Boxing',
    },
  },
  {
    name: 'UFC rounds group 1-3',
    text: `
Straight Bet
Rounds 1-3
D Poirier vs C McGregor
UFC 303
+400
Risk $50.00
`,
    expect: {
      market: 'other',
      side: '',
      odds: 400,
      selection_includes: 'Rounds 1-3',
      sport_label: 'UFC',
    },
  },
  {
    name: 'Fighter by decision keeps Side',
    text: `
Straight Bet
D Poirier by Decision
MAIN EVENT - POIRIER/MCGREGOR
UFC 303
+180
Risk $50.00
`,
    expect: {
      market: 'h2h',
      side: 'away',
      odds: 180,
      selection_includes: 'Poirier',
      selection_includes_method: 'Decision',
      sport_label: 'UFC',
      away_team: 'POIRIER',
      home_team: 'MCGREGOR',
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
  {
    name: 'BetMGM team parlay',
    text: `
BET SLIP
Parlay
Houston Texans +3.5                    -115
Spread
Houston Texans at Cleveland Browns
Los Angeles Chargers +2.5              -106
Spread
Los Angeles Chargers at Miami Dolphins
Vikings                                -154
Money Line
Minnesota Vikings at Chicago Bears
Stake 50
Total Odds +502
Potential Payout (inc Stake) 300.84 USD
`,
    expect: {
      market: 'parlay',
      stake_dollars: 50,
      odds: 502,
      selection_includes: 'Parlay',
      legs: 3,
    },
  },
  {
    name: 'FanDuel settled ALT prop parlay',
    text: `
DeMar DeRozan Over 23.5
DEMAR DEROZAN - ALT POINTS
Mo Bamba Over 5.5
MO BAMBA - ALT REBOUNDS
Cole Anthony Over 5.5
COLE ANTHONY - ALT ASSISTS
Anthony Edwards Over 26.5
ANTHONY EDWARDS - ALT POINTS
Jalen Suggs Over 4.5
JALEN SUGGS - ALT ASSISTS
$5.00
TOTAL WAGER
$611.82
WON ON FANDUEL
`,
    expect: {
      market: 'parlay',
      book: 'FanDuel',
      stake_dollars: 5,
      odds_blank: true,
      to_collect_dollars: 611.82,
      to_win_dollars: 606.82,
      selection_includes: 'Parlay',
      legs: 5,
      leg0_includes: 'DeRozan',
      leg0_stat_includes: 'Points',
    },
  },
  {
    name: 'Circa the D 5-team casino parlay (OCR split juice)',
    text: `
the D LAS VEGAS
301 FREMONT STREET LAS VEGAS, NV 89101
Sign up for a Mobile Wagering Account at the counter and download the Circa Sports mobile app today! circasports.com
E366ACEFC9AC
PARLAY (5 TEAMS)
1 BET(S) @ $10.00
Feb 01 2020 NBA
[518] MAGIC
+2-110
Feb 01 2020 NBA
[527] HAWKS
+4-110
Feb 01 2020 NBA
[531] JAZZ
-6-110
Feb 02 2020 NFL
SUPER BOWL LIV AT MIAMI GARDENS, FL
[101/102] 49ERS/CHIEFS
UN 54-110
Feb 01 2020 NBA
[529] HORNETS
+348
TICKET COST $10.00
TO WIN $527.60
TO COLLECT $537.60
February 01 2020 12:29:34
Circa Sports
`,
    expect: {
      market: 'parlay',
      book: 'Circa',
      stake_dollars: 10,
      odds_blank: true,
      to_win_dollars: 527.6,
      to_collect_dollars: 537.6,
      selection_includes: 'Parlay',
      legs: 5,
      leg0_includes: 'Magic',
      event_label: '',
    },
  },
  {
    name: 'Circa casino parlay parenthesized juice',
    text: `
PARLAY (5 TEAMS)
1 BET(S) @ $10.00
[518] MAGIC (+2 -110)
[527] HAWKS (+4 -110)
[531] JAZZ (-6 -110)
[101/102] 49ERS/CHIEFS (UN 54 -110)
[529] HORNETS (+348)
TICKET COST: $10.00
TO COLLECT: $537.60
Circa Sports
`,
    expect: {
      market: 'parlay',
      book: 'Circa',
      stake_dollars: 10,
      odds_blank: true,
      to_collect_dollars: 537.6,
      to_win_dollars: 527.6,
      selection_includes: 'Parlay',
      legs: 5,
      leg0_includes: 'Magic',
    },
  },
  {
    name: 'DraftKings 3-pick HR prop parlay',
    text: `
Receipt
3 Pick Parlay
+8076
Over 0.5 (Matt Olson)
MATT OLSON HOME RUNS
ATL Braves @ PHI Phillies
Must start and have 1+ plate appearance
+360
Over 0.5 (Yordan Alvarez)
YORDAN ALVAREZ HOME RUNS
NY Yankees @ HOU Astros
Must start and have 1+ plate appearance
+295
Over 0.5 (Shohei Ohtani)
SHOHEI OHTANI HOME RUNS
STL Cardinals @ LA Dodgers
Must start and have 1+ plate appearance
+350
$5.00
$408.82
Mar 29, 2024, 4:40:45AM DK638473056445061844
DraftKings
`,
    expect: {
      market: 'parlay',
      book: 'DraftKings',
      stake_dollars: 5,
      odds: 8076,
      selection_includes: 'Parlay',
      legs: 3,
      leg0_includes: 'Olson',
      leg0_stat_includes: 'Home Runs',
    },
  },
  {
    name: 'Hollywood futures 4-leg (cleaned)',
    text: `
HOLLYWOOD CASINO AT CHARLES TOWN RACES
Parlay (4 Picks)
Wager $400.00
Potential Payout $171,360.00
National League East 2020
ATL Braves (Winner)
+100
NFL Championship 2020/2021
KC Chiefs (Winner)
+600
NHL Championship 2019/2020
TB Lightning (Winner)
+800
WNBA 2020
SEA Storm (Winner)
+240
`,
    expect: {
      market: 'parlay',
      book: 'Hollywood',
      stake_dollars: 400,
      legs: 4,
      leg0_includes: 'Braves',
    },
  },
  {
    name: 'FanDuel CBB 8-leg open (cleaned)',
    text: fs.readFileSync(path.join(OCR_DIR, 'fd-cbb-8-cleaned.txt'), 'utf8'),
    expect: {
      market: 'parlay',
      odds: 9588,
      legs: 8,
      leg0_includes: 'Connecticut',
    },
  },
  {
    name: 'Wynn 5-team casino (cleaned fractions)',
    text: `
WYNN LAS VEGAS
PARLAY (5 TEAMS)
1 BET(S) @ $300.00
Jan 07 2019 COLLEGE FB
[151] CLEMSON
+195
Jan 07 2019 COLLEGE FB
[151/152] CLEMSON/ALABAMA
OV 57.5-110
Jan 07 2019 PRO BASKETBALL
[582] BUCKS
-5.5-110
Jan 07 2019 PRO BASKETBALL
[578] CELTICS
-10.5-110
Jan 07 2019 PRO BASKETBALL
[583/584] NUGGETS/ROCKETS
OV 215-110
TICKET COST: $300.00
TO WIN: $9,435.00
TO COLLECT: $9,735.00
`,
    expect: {
      market: 'parlay',
      book: 'Wynn',
      stake_dollars: 300,
      legs: 5,
      leg0_includes: 'Clemson',
    },
  },
  {
    name: 'Parlay Card 10 spreads',
    text: `
Parlay Card
$2.00 Parlay Card 10
Max Payout: $1,600.00
133 Michigan -1.5 Spread
Michigan At Penn State
11/13/2021 9:00 AM
152 Virginia +5.5 Spread
Notre Dame At Virginia
11/13/2021 4:30 PM
166 UNLV +3.5 Spread
Hawaii At UNLV
11/13/2021 1:00 PM
244 New England Patriots -2.5 Spread
Cleveland Browns At New England Patriots
11/14/2021 10:01 AM
245 Atlanta Falcons +9.5 Spread
Atlanta Falcons At Dallas Cowboys
11/14/2021 10:01 AM
252 Washington Football Team +9.5 Spread
Tampa Bay Buccaneers At Washington Football Team
11/14/2021 10:01 AM
253 Detroit Lions +8.5 Spread
Detroit Lions At Pittsburgh Steelers
11/14/2021 10:01 AM
255 Minnesota Vikings +3.5 Spread
Minnesota Vikings At Los Angeles Chargers
11/14/2021 1:06 PM
260 Green Bay Packers -3.5 Spread
Seattle Seahawks At Green Bay Packers
11/14/2021 1:26 PM
263 Kansas City Chiefs -2.5 Spread
Kansas City Chiefs At Las Vegas Raiders
11/14/2021 5:21 PM
Ticket Cost $2.00
`,
    expect: {
      market: 'parlay',
      stake_dollars: 2,
      odds_blank: true,
      to_collect_dollars: 1600,
      to_win_dollars: 1598,
      selection_includes: 'Parlay',
      legs: 10,
      leg0_includes: 'Michigan',
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
    if (e.odds_blank) assert(!d.odds, `${fx.name}: odds want blank got ${d.odds}`)
    else if (e.odds != null) assert(Number(d.odds) === e.odds, `${fx.name}: odds want ${e.odds} got ${d.odds}`)
    if (e.odds_string != null) {
      assert(
        String(d.odds) === e.odds_string,
        `${fx.name}: odds string want ${e.odds_string} got ${d.odds}`,
      )
    }
    if (e.to_win_dollars != null) {
      assert(
        Math.abs(Number(d.to_win_dollars) - e.to_win_dollars) < 0.02,
        `${fx.name}: to_win want ${e.to_win_dollars} got ${d.to_win_dollars}`,
      )
    }
    if (e.to_collect_dollars != null) {
      assert(
        Math.abs(Number(d.to_collect_dollars) - e.to_collect_dollars) < 0.02,
        `${fx.name}: to_collect want ${e.to_collect_dollars} got ${d.to_collect_dollars}`,
      )
    }
    if (e.selection_includes) {
      assert(
        String(d.selection_label).toLowerCase().includes(e.selection_includes.toLowerCase()),
        `${fx.name}: selection_label missing ${e.selection_includes}: ${d.selection_label}`,
      )
    }
    if (e.selection_includes_odds) {
      assert(
        String(d.selection_label).includes(e.selection_includes_odds),
        `${fx.name}: selection_label missing odds ${e.selection_includes_odds}: ${d.selection_label}`,
      )
    }
    if (e.selection_includes_stake) {
      assert(
        String(d.selection_label).includes(e.selection_includes_stake),
        `${fx.name}: selection_label missing stake ${e.selection_includes_stake}: ${d.selection_label}`,
      )
    }
    if (e.selection_includes_method) {
      assert(
        String(d.selection_label).toLowerCase().includes(e.selection_includes_method.toLowerCase()),
        `${fx.name}: selection_label missing method ${e.selection_includes_method}: ${d.selection_label}`,
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
    if (e.event_label != null) {
      assert(
        String(d.event_label || '') === e.event_label,
        `${fx.name}: event_label want ${e.event_label} got ${d.event_label}`,
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
    if (e.side !== undefined) {
      assert(d.side === e.side, `${fx.name}: side want ${JSON.stringify(e.side)} got ${JSON.stringify(d.side)}`)
    }
    if (e.legs != null) {
      const n = Array.isArray(d.legs) ? d.legs.length : 0
      assert(n === e.legs, `${fx.name}: legs want ${e.legs} got ${n}`)
    }
    if (e.leg0_includes) {
      const leg0 = Array.isArray(d.legs) ? d.legs[0] : null
      assert(
        String(leg0?.selection_label || '').toLowerCase().includes(e.leg0_includes.toLowerCase()),
        `${fx.name}: leg0 missing ${e.leg0_includes}: ${leg0?.selection_label}`,
      )
    }
    if (e.leg0_stat_includes) {
      const leg0 = Array.isArray(d.legs) ? d.legs[0] : null
      assert(
        String(leg0?.prop_stat || '').toLowerCase().includes(e.leg0_stat_includes.toLowerCase()),
        `${fx.name}: leg0 prop_stat missing ${e.leg0_stat_includes}: ${leg0?.prop_stat}`,
      )
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

// AI often dumps legs into notes with empty/placeholder legs[] … composer must hydrate.
try {
  const notes =
    'Parlay legs: Matt Olson over 0.5 HR (+360), Yordan Alvarez over 0.5 HR (+295), '
    + 'Shohei Ohtani over 0.5 HR (+350). Receipt shows total payout $408.82. '
    + 'Event time inferred from receipt timestamp; individual game start times not shown.'
  const hydrated = hydrateParlayLegsForDraft(
    {
      market: 'parlay',
      notes,
      odds: '+8076',
      stake_dollars: '5',
      legs: [
        { market: 'h2h', selection_label: 'Leg 1', odds: '-110' },
        { market: 'h2h', selection_label: 'Leg 2', odds: '-110' },
      ],
    },
    '',
  )
  assert(Array.isArray(hydrated.legs) && hydrated.legs.length === 3, 'notes hydrate: want 3 legs')
  assert(
    String(hydrated.legs[0]?.selection_label || '').includes('Olson'),
    `notes hydrate leg0: ${hydrated.legs[0]?.selection_label}`,
  )
  assert(
    String(hydrated.legs[2]?.selection_label || '').includes('Ohtani'),
    `notes hydrate leg2: ${hydrated.legs[2]?.selection_label}`,
  )
  // Richer notes beat a short OCR/heuristic leg list
  const preferNotes = hydrateParlayLegsForDraft(
    {
      market: 'parlay',
      notes,
      legs: [
        { market: 'prop', selection_label: 'Matt Olson Over 0.5 Home Runs', odds: '+360' },
        { market: 'prop', selection_label: 'Yordan Alvarez Over 0.5 Home Runs', odds: '+295' },
      ],
    },
    '',
  )
  assert(preferNotes.legs.length === 3, 'notes hydrate: prefer 3-note legs over 2 structured')
  console.log('ok  AI notes → parlay legs hydrate')
} catch (err) {
  failed += 1
  console.error(`FAIL AI notes → parlay legs hydrate: ${err.message}`)
}

// GN AC "Parlay 5 bets" … Edge drops Duke → hydrate from OCR restores 5
try {
  const gnOcr = fs.readFileSync(path.join(OCR_DIR, 'gn-ac-cbb-ml-5.ocr.txt'), 'utf8')
  assert(declaredParlayLegCount(gnOcr) === 5, 'GN AC declared count want 5')
  const full = parseSportsBetSlipText(gnOcr)[0]
  assert(full?.legs?.length === 5, 'GN AC full parse want 5')
  const short = {
    market: 'parlay',
    odds: '+219',
    stake_dollars: '25',
    selection_label: 'Parlay (4 legs)',
    notes: 'Parlay 5 bets',
    legs: (full.legs || []).filter((l) => !/duke/i.test(l.selection_label)).map((l) => ({
      ...l,
      selection_label: String(l.selection_label).replace(/ ML$/i, ' Money Line Ft'),
    })),
  }
  assert(short.legs.length === 4, 'GN AC short want 4')
  assert(isWeakSportsBetDraft(short, gnOcr) === true, 'GN AC short should be weak')
  const restored = hydrateParlayLegsForDraft(short, gnOcr)
  assert(restored.legs?.length === 5, `GN AC hydrate want 5 got ${restored.legs?.length}`)
  assert(
    restored.legs.some((l) => /duke/i.test(l.selection_label)),
    'GN AC hydrate should restore Duke',
  )
  console.log('ok  GN AC Parlay 5 bets under-count → hydrate Duke')
} catch (err) {
  failed += 1
  console.error(`FAIL GN AC under-count hydrate: ${err.message}`)
}

// Caesars casino … Edge glues dates / ticket footer into selections → hydrate prefers clean OCR
try {
  const czOcr = fs.readFileSync(path.join(OCR_DIR, 'caesars-casino-5.ocr.txt'), 'utf8')
  const clean = parseSportsBetSlipText(czOcr)[0]
  assert(clean?.legs?.length === 5, 'Caesars casino clean want 5')
  assert(
    clean.legs.every((l) => !legSelectionLooksJunk(l.selection_label)),
    'Caesars casino clean legs should not look junk',
  )
  const junkEdge = {
    market: 'parlay',
    odds: '+1195',
    stake_dollars: '25',
    selection_label: 'Parlay (5 legs)',
    notes: 'PARLAY (5 TEAMS)',
    legs: [
      { market: 'h2h', selection_label: 'Commanders', odds: '-110' },
      { market: 'h2h', selection_label: '[109] BILLS Jan 11 2026 - NFL PLAYOFF', odds: '+125' },
      { market: 'h2h', selection_label: 'Jan 12 2026 - NBA', odds: '-170' },
      { market: 'h2h', selection_label: '>25] LAKERS an 12 2026 - NBA', odds: '-410' },
      { market: 'h2h', selection_label: 'TO WIN: TICKET COST:', odds: '-190' },
    ],
  }
  assert(isWeakSportsBetDraft(junkEdge, czOcr) === true, 'Caesars junk Edge draft should be weak')
  const restored = hydrateParlayLegsForDraft(junkEdge, czOcr)
  assert(restored.legs?.length === 5, `Caesars hydrate want 5 got ${restored.legs?.length}`)
  assert(
    restored.legs.every((l) => !legSelectionLooksJunk(l.selection_label)),
    `Caesars hydrate still junk: ${restored.legs.map((l) => l.selection_label).join(' | ')}`,
  )
  assert(
    /ravens/i.test(restored.legs[0]?.selection_label || ''),
    `Caesars hydrate leg0 want Ravens got ${restored.legs[0]?.selection_label}`,
  )
  console.log('ok  Caesars casino Edge junk → hydrate clean teams')
} catch (err) {
  failed += 1
  console.error(`FAIL Caesars casino junk hydrate: ${err.message}`)
}

// Caesars casino … no printed American total → blank odds + To win / To collect
try {
  const czOcr = fs.readFileSync(path.join(OCR_DIR, 'caesars-casino-5.ocr.txt'), 'utf8')
  const clean = parseSportsBetSlipText(czOcr)[0]
  assert(!clean.odds, `Caesars parse odds want blank got ${clean.odds}`)
  assert(Number(clean.stake_dollars) === 25, `Caesars stake want 25 got ${clean.stake_dollars}`)
  assert(Math.abs(Number(clean.to_win_dollars) - 13071.25) < 0.02, `Caesars to_win got ${clean.to_win_dollars}`)
  assert(Math.abs(Number(clean.to_collect_dollars) - 13096.25) < 0.02, `Caesars to_collect got ${clean.to_collect_dollars}`)
  console.log('ok  Caesars casino blank odds + to_win/to_collect')
} catch (err) {
  failed += 1
  console.error(`FAIL Caesars blank odds + money: ${err.message}`)
}

// Caesars … Edge steals last leg juice (-190) → clear odds; keep money
try {
  const czOcr = fs.readFileSync(path.join(OCR_DIR, 'caesars-casino-5.ocr.txt'), 'utf8')
  const clean = parseSportsBetSlipText(czOcr)[0]
  const stolen = {
    market: 'parlay',
    odds: '-190',
    stake_dollars: '25',
    selection_label: 'Parlay (5 legs)',
    notes: 'PARLAY (5 TEAMS)',
    legs: clean.legs,
  }
  const fixed = hydrateParlayLegsForDraft(stolen, czOcr)
  assert(!fixed.odds, `Caesars stolen juice → blank odds got ${fixed.odds}`)
  assert(Math.abs(Number(fixed.to_collect_dollars) - 13096.25) < 0.02, `Caesars hydrate collect got ${fixed.to_collect_dollars}`)
  console.log('ok  Caesars stolen -190 cleared; to_collect filled')
} catch (err) {
  failed += 1
  console.error(`FAIL Caesars stolen ticket odds: ${err.message}`)
}

// Caesars … Edge invented leg-product +1195 → clear; Edge money kept
try {
  const czOcr = fs.readFileSync(path.join(OCR_DIR, 'caesars-casino-5.ocr.txt'), 'utf8')
  const clean = parseSportsBetSlipText(czOcr)[0]
  const thinOcr = czOcr
    .split('\n')
    .filter((l) => !/^\$/.test(l.trim()))
    .join('\n')
  const fromEdge = {
    market: 'parlay',
    odds: '+1195',
    stake_dollars: '25',
    to_collect_dollars: '13096.25',
    to_win_dollars: '13071.25',
    selection_label: 'Parlay (5 legs)',
    legs: clean.legs,
  }
  const fixed = hydrateParlayLegsForDraft(fromEdge, thinOcr)
  assert(!fixed.odds, `Caesars leg-product → blank odds got ${fixed.odds}`)
  assert(Math.abs(Number(fixed.to_win_dollars) - 13071.25) < 0.02, `Caesars Edge to_win got ${fixed.to_win_dollars}`)
  assert(Math.abs(Number(fixed.to_collect_dollars) - 13096.25) < 0.02, `Caesars Edge to_collect got ${fixed.to_collect_dollars}`)
  console.log('ok  Caesars Edge +1195 cleared; money kept')
} catch (err) {
  failed += 1
  console.error(`FAIL Caesars Edge money path: ${err.message}`)
}

/** Real Vision OCR dumps from Ryan's batch (2026-10-14). */
const ocrBatch = [
  {
    file: 'dk-hr-3pick.ocr.txt',
    expect: {
      legs: 3,
      odds_blank: true,
      stake_dollars: 5,
      to_collect_dollars: 408.82,
      to_win_dollars: 403.82,
      leg_odds: [360, 295, 350],
      leg0: 'Olson',
    },
  },
  {
    file: 'dk-alt-yards-boost.ocr.txt',
    expect: { legs: 4, odds: 9993, stake_dollars: 15, leg_odds: [155, 220, 220, 210], leg0: 'Chase' },
  },
  {
    file: 'dk-mlb-ml-betslip.ocr.txt',
    expect: { legs: 3, odds: 312, stake_dollars: 10, leg0: 'Jays' },
  },
  {
    file: 'fd-open-spreads-4.ocr.txt',
    expect: { legs: 4, odds: 1252, stake_dollars: 100, leg_odds: [-110, -109, -107, -112], leg0: 'Browns' },
  },
  {
    file: 'circa-d-5team.ocr.txt',
    expect: {
      legs: 5,
      stake_dollars: 10,
      odds_blank: true,
      to_win_dollars: 527.6,
      to_collect_dollars: 537.6,
      leg0: 'Magic',
      leg_last: 'Hornets',
    },
  },
  {
    file: 'wynn-5team.ocr.txt',
    expect: { legs: 5, stake_dollars: 300, leg0: 'Clemson' },
  },
  {
    file: 'rampart-5card.ocr.txt',
    expect: { legs: 5, stake_dollars: 80, leg0: 'Eagles', leg_last: 'Bills' },
  },
  {
    file: 'parlay-card-10.ocr.txt',
    expect: { legs: 10, stake_dollars: 2, leg0: 'Michigan' },
  },
  {
    file: 'hollywood-futures-4.ocr.txt',
    // Vision OCR missed Chiefs … keep ≥3 winners + stake until photo OCR improves
    expect: { legs_min: 3, stake_dollars: 400, book: 'Hollywood', leg0: 'Braves' },
  },
  {
    file: 'dk-ml-total-combo-4.ocr.txt',
    expect: { legs: 4, odds: 4964, stake_dollars: 10, leg0: 'Red Sox' },
  },
  {
    file: 'fd-soccer-6.ocr.txt',
    expect: { legs: 6, odds: 56898, stake_dollars: 5, book: 'FanDuel', leg0: 'Draw' },
  },
  {
    file: 'dk-mlb-ml-open-3.ocr.txt',
    expect: { legs: 3, odds: 590, stake_dollars: 100, leg0: 'Rays' },
  },
  {
    file: 'dk-nfl-ml-5.ocr.txt',
    expect: { legs: 5, stake_dollars: 100, leg0: 'Packers', leg_last: 'Bills' },
  },
  {
    file: 'fd-nba-ml-6.ocr.txt',
    expect: { legs: 6, stake_dollars: 5, book: 'FanDuel', leg0: 'Celtics', leg_last: 'Clippers' },
  },
  {
    file: 'liga365-decimal-5.ocr.txt',
    expect: { legs: 5, stake_dollars: 10, book: 'LIGA365', odds: 1829, leg0: 'Over' },
  },
  {
    file: 'fanatics-nfl-3.ocr.txt',
    expect: { legs: 3, odds: 466, stake_dollars: 10, book: 'Fanatics', leg0: 'Patriots' },
  },
  {
    file: 'dk-cfb-2.ocr.txt',
    expect: {
      legs: 2,
      odds_blank: true,
      stake_dollars: 100,
      to_win_dollars: 253.43,
      to_collect_dollars: 353.43,
      leg0: 'Under',
    },
  },
  {
    file: 'betrivers-ufc-3.ocr.txt',
    expect: {
      legs: 3,
      odds: 2620,
      stake_dollars: 100,
      to_win_dollars: 2620.25,
      to_collect_dollars: 2720.25,
      leg0: 'Chikadze',
      leg_last: 'Muhammad',
    },
  },
  // Batch #3 (2026-10-14) … DK N+ props, FD SGP open/settled, alt lines, spreads, × ML strip
  {
    file: 'dk-nba-nplus-props-4-cleaned.txt',
    expect: {
      legs: 4,
      odds: 256,
      leg_odds: [-210, -475, -370, -175],
      leg0: 'Cade',
      leg_last: 'Booker',
    },
  },
  {
    file: 'fd-sgp-open-hurts-3.ocr.txt',
    expect: { legs: 3, odds: 479, leg0: 'Packers', leg_last: 'Barkley' },
  },
  {
    file: 'fd-sgp-open-steelers-3.ocr.txt',
    expect: { legs: 3, odds: 1859, stake_dollars: 20, leg0: 'Steelers', leg_last: 'Claypool' },
  },
  {
    file: 'fd-dual-sgp-4.ocr.txt',
    expect: { legs: 4, odds: 1231, stake_dollars: 10, leg0: 'Raiders', leg_last: 'Over' },
  },
  {
    file: 'fd-alt-lines-5.ocr.txt',
    expect: {
      legs: 5,
      stake_dollars: 70,
      book: 'FanDuel',
      leg_odds: [-500, -385, -430, -335, -440],
      leg0: 'Twins',
      leg_last: 'Stars',
    },
  },
  {
    file: 'fd-spreads-3.ocr.txt',
    expect: {
      legs: 3,
      odds: 584,
      stake_dollars: 5,
      leg_odds: [-110, -110, -114],
      leg0: 'Broncos',
      leg_last: 'Giants',
    },
  },
  {
    file: 'dk-nfl-ml-5-xstrip.ocr.txt',
    expect: { legs: 5, stake_dollars: 100, leg0: 'Packers', leg_last: 'Bills' },
  },
  // Batch #4 (2026-10-14) … Caesars Horseshoe ML, GN AC numbered ML FT, casino brackets
  {
    file: 'caesars-horseshoe-10.ocr.txt',
    expect: {
      legs: 10,
      odds: 184,
      stake_dollars: 3600,
      book: 'Caesars',
      leg_odds: [-430, -250, -420, -1000, -1700, -15000, -10000, -2400, -1600, -7000],
      leg0: 'Eag',
      leg_last: 'Badgers',
    },
  },
  {
    file: 'caesars-horseshoe-4.ocr.txt',
    expect: {
      legs: 4,
      odds: 194,
      stake_dollars: 1200,
      book: 'Caesars',
      leg_odds: [-250, -267, -420, -430],
      leg0: 'Bengals',
      leg_last: 'Eagles',
    },
  },
  {
    file: 'gn-ac-cbb-ml-5.ocr.txt',
    expect: {
      legs: 5,
      odds: 219,
      stake_dollars: 25,
      book: 'Golden Nugget',
      leg_odds: [-240, -320, -380, -700, -525],
      leg0: 'Creighton',
      leg_last: 'Villanova',
    },
  },
  {
    file: 'gn-casino-5.ocr.txt',
    expect: {
      legs: 5,
      stake_dollars: 10,
      book: 'Golden Nugget',
      leg0: 'Wolves',
      leg_last: 'Kings',
    },
  },
  {
    file: 'caesars-casino-5.ocr.txt',
    expect: {
      legs: 5,
      stake_dollars: 25,
      odds_blank: true,
      to_win_dollars: 13071.25,
      to_collect_dollars: 13096.25,
      book: 'Caesars',
      leg_odds: [-110, 125, -170, -410, -190],
      leg0: 'Ravens',
      leg_last: 'Lakers',
    },
  },
  {
    file: 'dk-alt-yards-boost-2.ocr.txt',
    expect: { legs: 4, odds: 9993, stake_dollars: 15, leg_odds: [155, 220, 220, 210], leg0: 'Chase' },
  },
]

let ocrCount = 0
for (const row of ocrBatch) {
  ocrCount += 1
  const name = `OCR ${row.file}`
  try {
    const text = fs.readFileSync(path.join(OCR_DIR, row.file), 'utf8')
    const drafts = parseSportsBetSlipText(text)
    const d = drafts[0]
    assert(d, `${name}: no draft`)
    assert(d.market === 'parlay', `${name}: market ${d.market}`)
    const legs = Array.isArray(d.legs) ? d.legs : []
    const e = row.expect
    if (e.legs != null) assert(legs.length === e.legs, `${name}: legs ${legs.length}!=${e.legs}`)
    if (e.legs_min != null) assert(legs.length >= e.legs_min, `${name}: legs ${legs.length}<${e.legs_min}`)
    if (e.odds_blank) assert(!d.odds, `${name}: odds want blank got ${d.odds}`)
    else if (e.odds != null) assert(Math.abs(Number(d.odds)) === e.odds, `${name}: odds ${d.odds}`)
    if (e.stake_dollars != null) {
      assert(Number(d.stake_dollars) === e.stake_dollars, `${name}: stake ${d.stake_dollars}`)
    }
    if (e.to_win_dollars != null) {
      assert(
        Math.abs(Number(d.to_win_dollars) - e.to_win_dollars) < 0.02,
        `${name}: to_win ${d.to_win_dollars}`,
      )
    }
    if (e.to_collect_dollars != null) {
      assert(
        Math.abs(Number(d.to_collect_dollars) - e.to_collect_dollars) < 0.02,
        `${name}: to_collect ${d.to_collect_dollars}`,
      )
    }
    if (e.book) assert(d.book === e.book, `${name}: book ${d.book}`)
    if (e.leg0) {
      assert(
        String(legs[0]?.selection_label || '').toLowerCase().includes(e.leg0.toLowerCase()),
        `${name}: leg0 ${legs[0]?.selection_label}`,
      )
    }
    if (e.leg_last) {
      const last = legs[legs.length - 1]
      assert(
        String(last?.selection_label || '').toLowerCase().includes(e.leg_last.toLowerCase()),
        `${name}: leg_last ${last?.selection_label}`,
      )
    }
    if (e.leg_odds) {
      const got = legs.map((l) => Number(l.odds))
      assert(
        JSON.stringify(got) === JSON.stringify(e.leg_odds),
        `${name}: leg_odds ${got}!=${e.leg_odds}`,
      )
    }
    console.log(`ok  ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL ${name}: ${err.message}`)
  }
}

const total = fixtures.length + 6 + ocrCount
if (failed) {
  console.error(`\n${failed}/${total} failed`)
  process.exit(1)
}
console.log(`\n${total}/${total} passed`)
