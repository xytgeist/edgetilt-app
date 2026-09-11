/**
 * Static playbook for the Desk Math tab.
 * Live numbers come from lounge-odds-poll deskEvals.equations.
 */

export const DESK_MATH_SPORTS = [
  { id: 'americanfootball_nfl', label: 'NFL', short: 'NFL' },
  { id: 'americanfootball_ncaaf', label: 'CFB', short: 'CFB' },
  { id: 'mma_ufc', label: 'UFC', short: 'UFC' },
]

export const EQUATION_STATUS = {
  fire: { label: 'Fires', className: 'bg-emerald-950/80 text-emerald-300 ring-emerald-500/40' },
  pass: { label: 'No', className: 'bg-zinc-800 text-zinc-300 ring-zinc-600/40' },
  veto: { label: 'Veto', className: 'bg-rose-950/80 text-rose-300 ring-rose-500/40' },
  info: { label: 'Read', className: 'bg-sky-950/70 text-sky-300 ring-sky-500/30' },
}

export const DESK_PLAYBOOKS = {
  Scott: {
    football: {
      analyzes: 'Model vs the current market after PVAL. EPA + ESPN trench on NFL. CFB power on college.',
      gates: [
        { label: 'Base model', formula: 'NFL: −((home net EPA − away net EPA) × 22 + trench pts). CFB: (away power − home power) − HFA.', effect: 'Sets the pre-injury home spread.' },
        { label: 'PVAL', formula: 'adjusted = model − netSpreadImpactHome', effect: 'Moves the model. Does not vote by itself.' },
        { label: 'Gap', formula: '|market home − adjusted model|', effect: 'Fire at 2.5 pts. Value side is the cheap side vs the model.' },
        { label: 'True 3/7 key', formula: '3, 7, or the half onto those', effect: 'Soft 1.5 unlock. Non-keys stay PASS under 2.5.' },
      ],
      decision: 'PASS unless the gap clears 2.5, or 1.5 on a true 3/7 key. A Scott fire is a house ATS ballot.',
    },
    ufc: {
      analyzes: 'Model win % vs Pinnacle/Circa implied price.',
      gates: [
        { label: 'Fair price', formula: 'projected win % → American', effect: 'Scott’s number.' },
        { label: '+EV', formula: 'projected % − implied market %', effect: 'Takes the larger +EV moneyline.' },
      ],
      decision: 'Always takes a moneyline. Bigger +EV wins.',
    },
  },
  Rocco: {
    football: {
      analyzes: 'Short favorites, hook tax, hurt chalk, pasted chalk-trap, NFL trench / CFB power.',
      gates: [
        { label: 'Short-fav', formula: 'favorite −0.5 to −7.5', effect: 'Opens a look. Alone it is a lean, not a house vote.' },
        { label: 'Hurt / hook / trap / trench', formula: 'any one of these', effect: 'Strength reason. Counts as a house ballot if juice is clean.' },
        { label: 'Score', formula: 'signed home sum of those features', effect: 'Picks the side before juice.' },
        { label: 'Ugly juice', formula: 'worse than −115', effect: 'Hard PASS. VIP can still show the wanted line.' },
      ],
      decision: 'Feature + score, then juice veto, then house-strength gate.',
    },
    ufc: {
      analyzes: 'Striking differential and takedown control.',
      gates: [
        { label: 'Strike', formula: 'A net SLpM − B ≥ 1.2', effect: 'Fires fighter A.' },
        { label: 'Takedowns', formula: 'A control ≥ B + 0.5', effect: 'Fires fighter A. Else B.' },
      ],
      decision: 'A if either test clears, otherwise B.',
    },
  },
  Chedda: {
    football: {
      analyzes: 'Dogs and pasted sharp money. Never a street screenshot by itself.',
      gates: [
        { label: 'Dog', formula: 'plus points on the board', effect: 'Chedda’s lane.' },
        { label: 'Golden hook', formula: 'dog +3.5 / +7.5', effect: 'Unlocks that dog.' },
        { label: 'Dog + PVAL', formula: 'dog is also the model value side', effect: 'Unlocks that dog.' },
        { label: 'Pasted money', formula: 'Action/VSiN sharp divergence', effect: 'Highest priority. Beats hook / model.' },
      ],
      decision: 'Money first, else dog+hook or dog+PVAL. Else PASS.',
    },
    ufc: {
      analyzes: 'Plus-money dogs up to +260, with finish equity as flavor.',
      gates: [
        { label: 'Live dog', formula: 'ML +100 to +260', effect: 'Takes the dog.' },
        { label: 'Finish %', formula: 'write-up bump at ≥ 65%', effect: 'Does not unlock by itself.' },
      ],
      decision: 'Qualifying dog, else copy Rocco.',
    },
  },
  Tank: {
    football: {
      analyzes: 'Totals first. ATS spots are rest / weather / tempo / under+dog.',
      gates: [
        { label: 'Totals edge', formula: '3.5 pts, or 2.5 when crossing 48/51/54', effect: 'Over or Under before vetoes.' },
        { label: 'Wind / falling total', formula: '≥15 mph or total down ≥0.5 vs open', effect: 'Hard veto on Overs.' },
        { label: 'ATS reasons', formula: 'two independent, or under+dog alone', effect: 'Published spots count in the house tally.' },
        { label: 'Street fade', formula: 'strong pasted board the other way', effect: 'Kills a published spot.' },
      ],
      decision: 'Totals never fill ATS house buckets. Only a published ATS spot votes in the house.',
    },
    ufc: {
      analyzes: 'Round totals from finish rate and Apex cage.',
      gates: [
        { label: 'Finish', formula: '≥ 60% → Under', effect: 'Stoppage equity.' },
        { label: 'Apex', formula: '25-ft cage → Under', effect: 'Forces Under.' },
      ],
      decision: 'Under if finish or Apex, else Over.',
    },
  },
}

export function playbookFor(deskId, sportKey) {
  const book = DESK_PLAYBOOKS[deskId]
  if (!book) return null
  return sportKey === 'mma_ufc' ? book.ufc : book.football
}

export function equationStatusMeta(status) {
  return EQUATION_STATUS[status] || EQUATION_STATUS.info
}
