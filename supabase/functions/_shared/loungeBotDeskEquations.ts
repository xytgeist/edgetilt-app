/**
 * Structured desk-math traces for Ops.
 * Display only … never change a vote here. Callers pass the same numbers the desk used.
 */

export type DeskEquationStatus = 'fire' | 'pass' | 'veto' | 'info'

export type DeskEquation = {
  id: string
  label: string
  formula: string
  value: string
  status: DeskEquationStatus
  impact: string
}

export function deskEq(
  id: string,
  label: string,
  formula: string,
  value: string,
  status: DeskEquationStatus,
  impact: string,
): DeskEquation {
  return { id, label, formula, value, status, impact }
}

export function fmtDeskEqPts(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function signedPts(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  const rounded = Math.round(n * 10) / 10
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return rounded > 0 ? `+${body}` : body
}

function yesNo(ok: boolean): string {
  return ok ? 'yes' : 'no'
}

function teamWord(side: string, homeTeam: string, awayTeam: string): string {
  if (side === 'home') return homeTeam
  if (side === 'away') return awayTeam
  if (side === 'over') return 'Over'
  if (side === 'under') return 'Under'
  return 'PASS'
}

export function buildScottFootballEquations(input: {
  isCfb: boolean
  homeTeam: string
  awayTeam: string
  baseModelSpreadHome: number | null
  adjustedModelSpreadHome: number | null
  marketSpreadHome: number
  pvalImpactHome: number | null
  pvalSignificant: boolean
  pvalReason?: string | null
  hardFire: boolean
  softEligible: boolean
  pickIsTrueKey: boolean
  side: string
}): DeskEquation[] {
  const modelSrc = input.isCfb ? 'CFB power projection' : 'EPA + ESPN trench'
  const hasModel = input.baseModelSpreadHome != null
  const gap = input.adjustedModelSpreadHome != null
    ? Math.round(Math.abs(input.marketSpreadHome - input.adjustedModelSpreadHome) * 10) / 10
    : null
  const gapSigned = input.adjustedModelSpreadHome != null
    ? input.marketSpreadHome - input.adjustedModelSpreadHome
    : null
  const pvalOn = input.pvalSignificant && input.pvalImpactHome != null
  const decision = input.side === 'pass'
    ? 'PASS'
    : teamWord(input.side, input.homeTeam, input.awayTeam)

  return [
    deskEq(
      'scott_model',
      'Base model (home)',
      input.isCfb
        ? 'home power − away power → home spread'
        : '−(EPA home impact + trench home impact)',
      hasModel ? signedPts(input.baseModelSpreadHome) : 'missing',
      hasModel ? 'info' : 'veto',
      hasModel
        ? `${modelSrc} before injuries.`
        : 'No EPA / power row … Scott cannot fire.',
    ),
    deskEq(
      'scott_pval',
      'PVAL / injury',
      'adjusted = model − netSpreadImpactHome (home healthier is +impact)',
      pvalOn
        ? `${signedPts(input.pvalImpactHome)} home${input.pvalReason ? ` · ${input.pvalReason}` : ''}`
        : 'none',
      pvalOn ? 'fire' : 'pass',
      pvalOn
        ? 'Moves the model before the gap test. Does not vote by itself.'
        : 'No QB / ≥1.5 PVAL stack. Model stays raw.',
    ),
    deskEq(
      'scott_adj',
      'Adjusted model (home)',
      'base model after PVAL',
      fmtDeskEqPts(input.adjustedModelSpreadHome),
      input.adjustedModelSpreadHome != null ? 'info' : 'veto',
      'Number Scott compares to the market.',
    ),
    deskEq(
      'scott_market',
      'Market (home)',
      'locked close, else live sharp quote',
      signedPts(input.marketSpreadHome),
      'info',
      'Current board Scott is fading or passing.',
    ),
    deskEq(
      'scott_gap',
      'Gap',
      '|market home − adjusted model home|  ( + = home is the value side )',
      gap == null ? 'n/a' : `${fmtDeskEqPts(gap)} pts${gapSigned != null ? ` · signed ${signedPts(gapSigned)}` : ''}`,
      input.hardFire ? 'fire' : input.softEligible ? 'info' : 'pass',
      gap == null
        ? 'No gap without a model.'
        : input.hardFire
          ? 'Clears 2.5. Scott fires the value side.'
          : input.softEligible
            ? 'Between 1.5 and 2.5. Only a true 3/7 key can unlock.'
            : 'Under 2.5 (and not a 1.5 key). Scott PASSes.',
    ),
    deskEq(
      'scott_key',
      'True 3/7 key',
      'pick line is 3, 7, or the half onto those (2.5 / 3.5 / 6.5 / 7.5)',
      yesNo(input.pickIsTrueKey),
      input.softEligible && input.pickIsTrueKey ? 'fire' : 'pass',
      input.softEligible && input.pickIsTrueKey
        ? 'Soft 1.5 gap + key … Scott fires.'
        : 'Without a 2.5 gap, a non-key line stays PASS.',
    ),
    deskEq(
      'scott_decision',
      'Scott decision',
      'fire at 2.5, or 1.5 on a true 3/7 key. Else PASS.',
      decision,
      input.side === 'pass' ? 'pass' : 'fire',
      input.side === 'pass'
        ? 'No house ATS vote from Scott.'
        : `House vote: ${decision}.`,
    ),
  ]
}

export function buildRoccoFootballEquations(input: {
  homeTeam: string
  awayTeam: string
  homePoint: number
  awayPoint: number
  homePrice: number
  awayPrice: number
  isCfb: boolean
  isShortFavHome: boolean
  isShortFavAway: boolean
  hurtSide: 'home' | 'away' | null
  hookTaxHome: boolean
  hookTaxAway: boolean
  hookTaxPenalty: number
  chalkTrap: boolean
  chalkTrapPenalty: number
  trenchMismatch: boolean
  trenchBonus: number
  powerBonus: number
  starterOutPenalty: number
  scoreHome: number
  hasVoteFeature: boolean
  hasStrengthReason: boolean
  uglyJuice: boolean
  uglyJuiceCutoff: number
  leanSide: string
  side: string
  countsForHouse: boolean
}): DeskEquation[] {
  const lean = teamWord(input.leanSide, input.homeTeam, input.awayTeam)
  const decision = input.side === 'pass'
    ? (input.uglyJuice ? `PASS · wanted ${lean}` : 'PASS')
    : teamWord(input.side, input.homeTeam, input.awayTeam)
  const juicePrice = input.leanSide === 'home'
    ? input.homePrice
    : input.leanSide === 'away'
      ? input.awayPrice
      : null

  return [
    deskEq(
      'rocco_short',
      'Short favorite',
      'favorite from −0.5 through −7.5',
      input.isShortFavHome
        ? `${input.homeTeam} ${signedPts(input.homePoint)}`
        : input.isShortFavAway
          ? `${input.awayTeam} ${signedPts(input.awayPoint)}`
          : 'no',
      input.isShortFavHome || input.isShortFavAway ? 'fire' : 'pass',
      input.isShortFavHome || input.isShortFavAway
        ? 'Opens a Rocco look. Alone it is a lean, not a house vote.'
        : 'No short-fav. Other reasons can still open a look.',
    ),
    deskEq(
      'rocco_hurt',
      'Hurt side',
      'PVAL hurtSide on the favorite (QB / big absence)',
      input.hurtSide ? `${teamWord(input.hurtSide, input.homeTeam, input.awayTeam)} · ${signedPts(input.starterOutPenalty)}` : 'none',
      input.hurtSide ? 'fire' : 'pass',
      input.hurtSide
        ? 'Strength reason. Counts toward a house vote if juice is clean.'
        : 'No injury lean for Rocco.',
    ),
    deskEq(
      'rocco_hook',
      'Hook tax',
      'short-fav laying the hook on 3 or 7 (−3.5 / −7.5)',
      Math.abs(input.hookTaxPenalty) >= 0.8
        ? `${signedPts(input.hookTaxPenalty)} (${input.hookTaxHome ? input.homeTeam : input.awayTeam})`
        : 'no',
      Math.abs(input.hookTaxPenalty) >= 0.8 ? 'fire' : 'pass',
      Math.abs(input.hookTaxPenalty) >= 0.8
        ? 'Fades the taxed favorite. Strength reason.'
        : 'No hook-tax fade.',
    ),
    deskEq(
      'rocco_trap',
      'Pasted chalk-trap',
      'short-fav AND pasted sharp money on the dog',
      input.chalkTrap ? `yes · ${signedPts(input.chalkTrapPenalty)}` : 'no',
      input.chalkTrap ? 'fire' : 'pass',
      input.chalkTrap
        ? 'Fade the chalk. Strength reason. Needs a real Action/VSiN paste.'
        : 'No pasted reverse on the short-fav.',
    ),
    deskEq(
      'rocco_trench',
      input.isCfb ? 'CFB power gap' : 'Trench mismatch',
      input.isCfb
        ? '|home power − away power| > 10 on a favorite'
        : 'ESPN trench mismatch × 0.8, capped ±1.8',
      input.isCfb
        ? (Math.abs(input.powerBonus) >= 1 ? signedPts(input.powerBonus) : 'no')
        : (input.trenchMismatch ? `${signedPts(input.trenchBonus)} mismatch` : 'no'),
      input.isCfb
        ? (Math.abs(input.powerBonus) >= 1 ? 'fire' : 'pass')
        : (input.trenchMismatch ? 'fire' : 'pass'),
      input.isCfb
        ? (Math.abs(input.powerBonus) >= 1
          ? 'Power gap on a fav. Strength reason.'
          : 'No 10-pt power gap on a favorite.')
        : (input.trenchMismatch
          ? 'Trench disagrees with the number. Strength reason.'
          : 'No ESPN trench mismatch.'),
    ),
    deskEq(
      'rocco_score',
      'Rocco score (home)',
      'short-fav ±1.2 + hook + trap + trench/power + hurt',
      input.hasVoteFeature ? signedPts(input.scoreHome) : 'n/a',
      !input.hasVoteFeature ? 'pass' : input.scoreHome >= 0 ? 'fire' : 'info',
      !input.hasVoteFeature
        ? 'No feature … no lean.'
        : input.scoreHome >= 0
          ? `Leans ${input.homeTeam} before juice.`
          : `Leans ${input.awayTeam} before juice.`,
    ),
    deskEq(
      'rocco_juice',
      'Ugly juice',
      `price worse than ${input.uglyJuiceCutoff} is a hard PASS`,
      juicePrice == null ? 'n/a' : `${juicePrice}${input.uglyJuice ? ' · veto' : ' · ok'}`,
      input.uglyJuice ? 'veto' : 'pass',
      input.uglyJuice
        ? 'Kills the house vote. VIP can still show the wanted line.'
        : 'Juice is playable.',
    ),
    deskEq(
      'rocco_house',
      'House strength',
      'hurt / hook / trap / trench / CFB power … short-fav alone does not count',
      yesNo(input.countsForHouse),
      input.countsForHouse ? 'fire' : 'pass',
      input.countsForHouse
        ? 'This lean is a house ATS ballot.'
        : input.side !== 'pass' && !input.hasStrengthReason
          ? 'Lean only … does not count in hammer / consensus.'
          : 'No house vote.',
    ),
    deskEq(
      'rocco_decision',
      'Rocco decision',
      'feature + score side, then ugly-juice veto, then house-strength gate',
      decision,
      input.side === 'pass' ? (input.uglyJuice ? 'veto' : 'pass') : 'fire',
      input.side === 'pass'
        ? 'No Rocco house vote.'
        : input.countsForHouse
          ? `House vote: ${decision}.`
          : `Desk lean ${decision} … not a house ballot.`,
    ),
  ]
}

export function buildCheddaFootballEquations(input: {
  homeTeam: string
  awayTeam: string
  homeIsDog: boolean
  awayIsDog: boolean
  goldenHookHome: boolean
  goldenHookAway: boolean
  modelDogHome: boolean
  modelDogAway: boolean
  moneyHome: boolean
  moneyAway: boolean
  hasRealSplits: boolean
  splitsLine?: string | null
  side: string
}): DeskEquation[] {
  const decision = input.side === 'pass'
    ? 'PASS'
    : teamWord(input.side, input.homeTeam, input.awayTeam)
  const dog = input.homeIsDog
    ? input.homeTeam
    : input.awayIsDog
      ? input.awayTeam
      : 'pick-em / none'

  return [
    deskEq(
      'chedda_dog',
      'Dog on the board',
      'home point > 0 or away point > 0',
      dog,
      input.homeIsDog || input.awayIsDog ? 'info' : 'pass',
      input.homeIsDog || input.awayIsDog
        ? 'Chedda only fires dogs (or pasted money).'
        : 'No dog. Chedda stays PASS unless pasted money says otherwise.',
    ),
    deskEq(
      'chedda_hook',
      'Dog + golden hook',
      'dog gets the hook over 3 or 7 (+3.5 / +7.5)',
      input.goldenHookHome
        ? input.homeTeam
        : input.goldenHookAway
          ? input.awayTeam
          : 'no',
      input.goldenHookHome || input.goldenHookAway ? 'fire' : 'pass',
      input.goldenHookHome || input.goldenHookAway
        ? 'Unlocks Chedda on that dog.'
        : 'No golden hook on a dog.',
    ),
    deskEq(
      'chedda_pval',
      'Dog + model / PVAL',
      'dog is also Scott/CFB value side after PVAL',
      input.modelDogHome
        ? input.homeTeam
        : input.modelDogAway
          ? input.awayTeam
          : 'no',
      input.modelDogHome || input.modelDogAway ? 'fire' : 'pass',
      input.modelDogHome || input.modelDogAway
        ? 'Model agrees with the dog. Unlocks Chedda.'
        : 'Dog is not the model value side.',
    ),
    deskEq(
      'chedda_money',
      'Pasted sharp money',
      'Action/VSiN paste + sharp divergence (never synthetic)',
      !input.hasRealSplits
        ? 'no paste'
        : input.moneyHome
          ? `${input.homeTeam}${input.splitsLine ? ` · ${input.splitsLine}` : ''}`
          : input.moneyAway
            ? `${input.awayTeam}${input.splitsLine ? ` · ${input.splitsLine}` : ''}`
            : 'paste, no divergence',
      input.moneyHome || input.moneyAway ? 'fire' : 'pass',
      input.moneyHome || input.moneyAway
        ? 'Highest priority. Beats hook / model when they disagree.'
        : input.hasRealSplits
          ? 'Board is pasted but sharp money is not diverging.'
          : 'Need a real Action/VSiN paste. Street screenshots do not count.',
    ),
    deskEq(
      'chedda_decision',
      'Chedda decision',
      'money first, else dog+hook or dog+PVAL. No street board, no fire.',
      decision,
      input.side === 'pass' ? 'pass' : 'fire',
      input.side === 'pass'
        ? 'No Chedda house vote.'
        : `House vote: ${decision}.`,
    ),
  ]
}

export function buildTankTotalsEquations(input: {
  modelTotal: number | null
  marketTotal: number | null
  openTotal: number | null
  isHighWind: boolean
  isCfb: boolean
  isNonConference: boolean
  keyCross: boolean
  absEdge: number | null
  side: string
}): DeskEquation[] {
  const decision = input.side === 'pass'
    ? 'PASS'
    : input.side === 'over'
      ? 'Over'
      : 'Under'
  const edgeOk = input.absEdge != null && input.absEdge >= 3.5
  const lookOk = input.absEdge != null && input.absEdge >= 2.5 && input.keyCross

  return [
    deskEq(
      'tank_model_total',
      'Model total',
      input.isCfb ? 'CFB tempo / power total' : 'NFL off/def efficiency + tempo',
      fmtDeskEqPts(input.modelTotal),
      input.modelTotal != null ? 'info' : 'veto',
      input.modelTotal != null ? 'Tank’s number.' : 'No model total … PASS.',
    ),
    deskEq(
      'tank_market_total',
      'Market total',
      'locked close, else live book',
      fmtDeskEqPts(input.marketTotal),
      input.marketTotal != null ? 'info' : 'veto',
      'Board Tank is fading or passing.',
    ),
    deskEq(
      'tank_edge',
      'Total edge',
      'model − market. Fire at 3.5, or 2.5 when crossing 48/51/54',
      input.absEdge == null ? 'n/a' : `${fmtDeskEqPts(input.absEdge)} pts`,
      edgeOk || lookOk ? 'fire' : 'pass',
      edgeOk
        ? 'Clears 3.5. Lean is live before vetoes.'
        : lookOk
          ? '2.5+ and crosses a key total.'
          : 'Under the totals threshold.',
    ),
    deskEq(
      'tank_key',
      'Key total cross',
      'model and market on opposite sides of 48, 51, or 54',
      yesNo(input.keyCross),
      input.keyCross ? 'fire' : 'pass',
      input.keyCross
        ? 'Softens the fire line to 2.5.'
        : 'No 48/51/54 cross.',
    ),
    deskEq(
      'tank_wind',
      'Wind veto (Overs)',
      'outdoor ≥15 mph kills the Over',
      input.isHighWind ? 'high wind' : 'clear',
      input.isHighWind && input.side === 'pass' ? 'veto' : input.isHighWind ? 'veto' : 'pass',
      input.isHighWind
        ? 'Hard veto on Overs. Unders can still play.'
        : 'No wind veto.',
    ),
    deskEq(
      'tank_open',
      'Open vs current',
      'falling total (≥0.5 vs open) vetoes Overs. Rising confirms.',
      input.openTotal == null
        ? 'no open file'
        : input.marketTotal == null
          ? 'n/a'
          : `${fmtDeskEqPts(input.openTotal)} → ${fmtDeskEqPts(input.marketTotal)}`,
      'info',
      input.openTotal == null
        ? 'Missing open does not block a hard 3.5 Over.'
        : 'Falling totals kill Overs. Soft non-conf Overs also need the total up.',
    ),
    deskEq(
      'tank_nonconf',
      'CFB non-conference Over',
      'unfamiliarity bump to 3.0 when wind is clear',
      input.isCfb && input.isNonConference ? 'yes' : 'no',
      input.isCfb && input.isNonConference ? 'info' : 'pass',
      input.isCfb && input.isNonConference
        ? 'Can unlock a soft Over if edge ≥ 3.0 and the total rose.'
        : 'NFL / same-conference … no bump.',
    ),
    deskEq(
      'tank_decision',
      'Tank totals decision',
      'edge or key-cross, then wind / falling-total vetoes. Totals never fill ATS house buckets.',
      decision,
      input.side === 'pass' ? 'pass' : 'fire',
      input.side === 'pass'
        ? 'No totals lean. ATS spot is a separate equation set.'
        : `${decision} is Tank’s totals card. House ATS uses the spot, not this.`,
    ),
  ]
}

export function buildTankAtsEquations(input: {
  homeTeam: string
  awayTeam: string
  restReasons: string[]
  weatherReasons: string[]
  tempoReasons: string[]
  underDog: boolean
  conflict: boolean
  streetFade: boolean
  reasons: string[]
  published: boolean
  side: string
  rationale: string
}): DeskEquation[] {
  const decision = input.published
    ? teamWord(input.side, input.homeTeam, input.awayTeam)
    : 'PASS'
  const rest = input.restReasons.length ? input.restReasons.join(', ') : 'no'
  const weather = input.weatherReasons.length ? input.weatherReasons.join(', ') : 'no'
  const tempo = input.tempoReasons.length ? input.tempoReasons.join(', ') : 'no'

  return [
    deskEq(
      'tank_ats_rest',
      'Rest / travel',
      'rested team vs short week / B2B / TZ / fatigue',
      rest,
      input.restReasons.length ? 'fire' : 'pass',
      input.restReasons.length
        ? 'One independent ATS reason.'
        : 'No rest/travel tell.',
    ),
    deskEq(
      'tank_ats_weather',
      'Weather as a side',
      'wind/precip lean on the dog … Over + weather dog is a conflict',
      weather,
      input.weatherReasons.length ? 'fire' : 'pass',
      input.weatherReasons.length
        ? 'One independent ATS reason.'
        : 'No weather side lean.',
    ),
    deskEq(
      'tank_ats_tempo',
      'Tempo / clock',
      'CFB tempo gap that leans a side',
      tempo,
      input.tempoReasons.length ? 'fire' : 'pass',
      input.tempoReasons.length
        ? 'One independent ATS reason.'
        : 'No tempo side lean.',
    ),
    deskEq(
      'tank_ats_underdog',
      'Under + dog',
      'Tank totals Under stacked with the dog',
      yesNo(input.underDog),
      input.underDog ? 'fire' : 'pass',
      input.underDog
        ? 'Unique Tank tell. Can publish with this reason alone.'
        : 'No under+dog stack.',
    ),
    deskEq(
      'tank_ats_agree',
      'Two reasons same way',
      'need two independent reasons, or the unique under+dog tell',
      input.reasons.length ? input.reasons.join(' + ') : 'none',
      input.reasons.length >= 2 || input.underDog ? 'fire' : 'pass',
      input.conflict
        ? 'Sides disagree … PASS.'
        : input.reasons.length >= 2 || input.underDog
          ? 'Situational fire is live before street.'
          : 'One reason is a look only.',
    ),
    deskEq(
      'tank_ats_street',
      'Street board',
      'strong pasted fade kills a published spot',
      input.streetFade ? 'fade · killed' : 'clear / no strong fade',
      input.streetFade ? 'veto' : 'pass',
      input.streetFade
        ? 'Public/ticket board faded the spot. Not published.'
        : 'Street does not veto.',
    ),
    deskEq(
      'tank_ats_decision',
      'Tank ATS decision',
      'publish if two reasons (or under+dog) and street does not fade. Published spots count in the house tally.',
      `${decision}${input.rationale ? ` · ${input.rationale}` : ''}`,
      input.published ? 'fire' : input.streetFade || input.conflict ? 'veto' : 'pass',
      input.published
        ? `House ATS vote: ${decision}.`
        : 'No Tank house vote.',
    ),
  ]
}

export function buildUfcScottEquations(input: {
  fighterA: string
  fighterB: string
  oddsA: number
  oddsB: number
  edgeA: number | null
  edgeB: number | null
  fairA: number | null
  fairB: number | null
  side: 'A' | 'B' | 'Over' | 'Under'
}): DeskEquation[] {
  const pick = input.side === 'A' ? input.fighterA : input.fighterB
  const edge = input.side === 'A' ? input.edgeA : input.edgeB
  return [
    deskEq(
      'ufc_scott_fair',
      'Model fair price',
      'projected win % → American fair odds',
      input.fairA == null
        ? 'no metrics'
        : `${input.fighterA} ${input.fairA} / ${input.fighterB} ${input.fairB}`,
      input.fairA != null ? 'info' : 'pass',
      'Scott’s number vs Pinnacle/Circa.',
    ),
    deskEq(
      'ufc_scott_edge',
      '+EV vs market',
      'projected win % − implied market %',
      edge == null
        ? 'n/a'
        : `${pick} ${signedPts(Math.round((edge || 0) * 1000) / 10)}%`,
      edge != null && edge > 0 ? 'fire' : 'pass',
      edge != null
        ? `Takes the larger +EV side (${pick}).`
        : 'No matchup metrics … falls back to sharp side / chalk.',
    ),
    deskEq(
      'ufc_scott_decision',
      'Scott decision',
      'larger +EV moneyline',
      pick,
      'fire',
      `Fight vote: ${pick}.`,
    ),
  ]
}

export function buildUfcRoccoEquations(input: {
  fighterA: string
  fighterB: string
  strikingDiffA: number | null
  tdA: number | null
  tdB: number | null
  side: 'A' | 'B' | 'Over' | 'Under'
}): DeskEquation[] {
  const pick = input.side === 'A' ? input.fighterA : input.fighterB
  const tdGap = input.tdA != null && input.tdB != null
    ? Math.round((input.tdA - input.tdB) * 100) / 100
    : null
  const strikeFire = input.strikingDiffA != null && input.strikingDiffA >= 1.2
  const tdFire = tdGap != null && tdGap >= 0.5
  return [
    deskEq(
      'ufc_rocco_strike',
      'Striking differential (A)',
      'net SLpM A − net SLpM B. Fire A at ≥ 1.2',
      input.strikingDiffA == null ? 'n/a' : signedPts(input.strikingDiffA),
      strikeFire ? 'fire' : 'pass',
      strikeFire ? `${input.fighterA} wins the striking test.` : 'No 1.2 SLpM edge for A.',
    ),
    deskEq(
      'ufc_rocco_td',
      'Takedown control',
      'A control ≥ B + 0.5 fires A',
      tdGap == null ? 'n/a' : `${signedPts(tdGap)} (A ${fmtDeskEqPts(input.tdA)} vs B ${fmtDeskEqPts(input.tdB)})`,
      tdFire ? 'fire' : 'pass',
      tdFire ? `${input.fighterA} wins the grappling test.` : 'No 0.5 takedown-control gap for A.',
    ),
    deskEq(
      'ufc_rocco_decision',
      'Rocco decision',
      'A if strike ≥ 1.2 or TD gap ≥ 0.5, else B',
      pick,
      'fire',
      `Fight vote: ${pick}.`,
    ),
  ]
}

export function buildUfcCheddaEquations(input: {
  fighterA: string
  fighterB: string
  oddsA: number
  oddsB: number
  finishProb: number | null
  dogSide: 'A' | 'B' | null
  side: 'A' | 'B' | 'Over' | 'Under'
  copiedRocco: boolean
}): DeskEquation[] {
  const pick = input.side === 'A' ? input.fighterA : input.side === 'B' ? input.fighterB : String(input.side)
  const dogOdds = input.dogSide === 'A'
    ? input.oddsA
    : input.dogSide === 'B'
      ? input.oddsB
      : null
  return [
    deskEq(
      'ufc_chedda_dog',
      'Live dog ≤ +260',
      'plus-money ML up to +260',
      input.dogSide
        ? `${input.dogSide === 'A' ? input.fighterA : input.fighterB} ${dogOdds}`
        : 'no qualifying dog',
      input.dogSide ? 'fire' : 'pass',
      input.dogSide
        ? 'Chedda takes the plus-money side.'
        : 'No dog in range … copies Rocco.',
    ),
    deskEq(
      'ufc_chedda_finish',
      'Finish equity',
      'projected finish % on a live dog',
      input.finishProb == null ? 'n/a' : `${Math.round(input.finishProb * 100)}%`,
      input.finishProb != null && input.finishProb >= 0.65 ? 'fire' : 'info',
      input.finishProb != null && input.finishProb >= 0.65
        ? 'Puncher’s-chance bump on the dog write-up.'
        : 'Finish rate is flavor, not a separate unlock.',
    ),
    deskEq(
      'ufc_chedda_decision',
      'Chedda decision',
      'dog ≤ +260, else copy Rocco chalk',
      pick + (input.copiedRocco ? ' · copied Rocco' : ''),
      'fire',
      `Fight vote: ${pick}.`,
    ),
  ]
}

export function buildUfcTankEquations(input: {
  totalLine: number
  finishProb: number | null
  isApex: boolean
  side: 'A' | 'B' | 'Over' | 'Under'
}): DeskEquation[] {
  const underFire = input.isApex || (input.finishProb != null && input.finishProb >= 0.6)
  const decision = input.side === 'Over'
    ? `Over ${input.totalLine}`
    : input.side === 'Under'
      ? `Under ${input.totalLine}`
      : String(input.side)
  return [
    deskEq(
      'ufc_tank_finish',
      'Projected finish',
      'finish ≥ 60% → Under',
      input.finishProb == null ? 'n/a' : `${Math.round(input.finishProb * 100)}%`,
      underFire && !input.isApex ? 'fire' : 'info',
      input.finishProb != null && input.finishProb >= 0.6
        ? 'Stoppage equity leans Under.'
        : 'Distance battle leans Over unless Apex.',
    ),
    deskEq(
      'ufc_tank_apex',
      'Apex 25-ft cage',
      'small cage → Under',
      yesNo(input.isApex),
      input.isApex ? 'fire' : 'pass',
      input.isApex ? 'Apex forces Under.' : 'Standard cage.',
    ),
    deskEq(
      'ufc_tank_decision',
      'Tank decision',
      'Under if finish ≥ 60% or Apex, else Over',
      decision,
      input.side === 'Under' || input.side === 'Over' ? 'fire' : 'info',
      `Totals vote: ${decision}.`,
    ),
  ]
}
