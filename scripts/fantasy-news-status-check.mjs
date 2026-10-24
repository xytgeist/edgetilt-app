#!/usr/bin/env node
/** Regression cases for fantasyNewsStatus: teammate injuries in a player's note must not become his status. */
import assert from 'node:assert/strict'
import { lineupNews, noteStatus } from '../src/features/fantasy/fantasyNewsStatus.js'

const cases = [
  {
    name: 'Jones: teammate Mason questionable / on IR',
    want: '',
    note: {
      player: 'Aaron Jones',
      headline:
        "Jones may log fewer touches in Week 7 against Indianapolis on Sunday, as fellow RB Jordan Mason (thumb) is questionable to suit up, Craig Peters of the Vikings' official site reports.",
      story:
        "After logging a modest 12 touches in Minnesota's season-opening win over Green Bay, Jones has taken on a massive workload in Mason's absence. However, Mason would almost certainly cut into that workload if he's active Sunday. Fantasy managers shouldn't have to wait until Sunday to get a better read on the situation, as Mason -- who is still on IR -- will need to be activated Saturday in order to be eligible to play against the Colts on Sunday.",
    },
  },
  {
    name: 'Worthy: teammate Rice ruled out',
    want: '',
    note: {
      player: 'Xavier Worthy',
      headline:
        "Worthy will once again operate as the Chiefs' top wide receiver after Rashee Rice (hamstring/knee) was ruled out ahead of Sunday's game against the Seahawks, Pete Sweeney of The Kansas City Star reports.",
      story:
        "It'll be the second consecutive game that Rice will be sidelined due to hamstring and knee injuries that he sustained in Week 4 against the Raiders. Worthy paced the Chiefs with seven catches on as many targets for 73 yards in a Week 6 win against the Chargers.",
    },
  },
  {
    name: 'own status: ruled out',
    want: 'out',
    note: { player: 'Xavier Worthy', headline: "Worthy (ankle) has been ruled out for Sunday's game against the Seahawks." },
  },
  {
    name: 'own status: questionable with suffix name',
    want: 'questionable',
    note: { player: 'Aaron Jones Sr.', headline: 'Jones (hamstring) is listed as questionable for Sunday against the Colts.' },
  },
  {
    name: 'own status: pronoun clause after his name',
    want: 'out',
    note: { player: 'Jordan Mason', headline: 'Mason did not practice Friday, and he will not play Sunday.' },
  },
  {
    name: 'own status: injured reserve',
    want: 'out',
    note: { player: 'Jordan Mason', headline: 'The Vikings placed Mason (thumb) on injured reserve Wednesday.' },
  },
  {
    name: 'own status: cleared',
    want: 'cleared',
    note: { player: 'Rashee Rice', headline: 'Rice (hamstring) practiced fully Friday and will play Sunday.' },
  },
  {
    name: 'insider full name',
    want: 'out',
    note: { player: 'Xavier Worthy', headline: 'Chiefs WR Xavier Worthy has been ruled out for Sunday.' },
  },
]

let failed = 0
for (const c of cases) {
  const got = noteStatus(c.note)
  if (got === c.want) console.log(`ok   ${c.name}`)
  else {
    failed += 1
    console.log(`FAIL ${c.name}: got "${got}", want "${c.want}"`)
  }
}

// Teammate injury news is still lineup news for the player (row flag + panel).
assert.equal(lineupNews(cases[1].note), true, 'Worthy role news keeps the NEWS flag')

if (failed) {
  console.log(`${failed} failed`)
  process.exit(1)
}
console.log('all passed')
