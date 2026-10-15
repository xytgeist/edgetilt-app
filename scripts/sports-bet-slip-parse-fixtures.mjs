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
      odds: 12136,
      selection_includes: 'Parlay',
      legs: 5,
      leg0_includes: 'DeRozan',
      leg0_stat_includes: 'Points',
    },
  },
  {
    name: 'Circa the D 5-team casino parlay',
    text: `
the D LAS VEGAS
PARLAY (5 TEAMS)
1 BET(S) @ $10.00
Feb 01 2020 NBA
[518] MAGIC (+2 -110)
Feb 01 2020 NBA
[527] HAWKS (+4 -110)
Feb 01 2020 NBA
[531] JAZZ (-6 -110)
Feb 02 2020 NFL
[101/102] 49ERS/CHIEFS (UN 54 -110)
Feb 01 2020 NBA
[529] HORNETS (+348)
TICKET COST: $10.00
TO WIN: $527.60
TO COLLECT: $537.60
Circa Sports
`,
    expect: {
      market: 'parlay',
      book: 'Circa',
      stake_dollars: 10,
      odds: 5276,
      selection_includes: 'Parlay',
      legs: 5,
      leg0_includes: 'Magic',
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
      odds: 79900,
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
    if (e.odds != null) assert(Number(d.odds) === e.odds, `${fx.name}: odds want ${e.odds} got ${d.odds}`)
    if (e.odds_string != null) {
      assert(
        String(d.odds) === e.odds_string,
        `${fx.name}: odds string want ${e.odds_string} got ${d.odds}`,
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

if (failed) {
  console.error(`\n${failed}/${fixtures.length} failed`)
  process.exit(1)
}
console.log(`\n${fixtures.length}/${fixtures.length} passed`)
