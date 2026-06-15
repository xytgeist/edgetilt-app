/**
 * Locked rules for AP guide batch synthesis (Ryan voice, LVSlotPro originals).
 * Import in batch ingest / resynth scripts — do not paraphrase from source HTML with attribution.
 */

export const AP_GUIDE_VOICE_RULES = {
  /** Never name or link sites we scraped (MP, AP, Slot Farmers, Advantage Play, etc.). */
  noSourceAttribution: true,
  /** Synthesize facts into first-person / field AP voice ("some APs", "field reports"). */
  voice: 'ryan-field-ap',
  /** Standard section order (buildGuideMarkdown). */
  sections: [
    'when_to_play',
    'when_to_stop',
    'how_to_check',
    'risk_bankroll',
    'risk_summary',
    'where_to_find',
    'skins_markdown',
    'gameplay_mechanics',
  ],
  /** Where to find: ### heading, Vegas bullets, numbered regions — no summary line; no travel-planning copy. */
  whereToFindFormat: 'lightning-numbered-regions-no-summary-no-travel',
  /** Ingest without hero; Ryan adds in form. */
  heroes: 'form-later-text-only',
  /** New cards default no calculator unless obvious from game family. */
  calculators: 'no-calc-unless-obvious',
  published: true,
  sourceFolder: 'ap-guide-workspace only (not machinepro-export/, etc.)',
  completedArchive: '___DONE/',
  /** Cut filler closing lines in summaries and section tails when the point is already made. */
  concise: true,
  /** Skins: name the skins; skip "(verify on glass)" and "same core" unless mechanics differ. */
  skinsMinimal: 'names-only-by-default',
  /** When to play opens with the hunt threshold, not mechanics primer. */
  whenToPlayLead: 'primary-play-first',
  /** Sound like Ryan's edited cards on test — not generic AI guide copy. */
  soundHuman: 'match-ryan-edited-guides-on-test',
}

/**
 * Published guides Ryan has edited — read these on test before batch synth for voice.
 * (Not an exhaustive list; grows as cards ship.)
 */
export const RYAN_VOICE_REFERENCE_SLUGS = [
  '5-coin-frenzy-jackpots',
  '88-fortunes-emperors-coins',
  'alien-heroes',
  'angel-blade-sword-of-destiny',
  'blazin-diamond-lightning-wilds',
  'buffalo-link',
  'coin-kingdom-aztec',
  'big-ocean-jackpots',
  'block-bonanza-hawaii-rio',
]

/**
 * Ryan voice traits (from his edited cards — not AI polish).
 * @type {string[]}
 */
export const RYAN_VOICE_TRAITS = [
  'When to play: **Primary play / threshold first** ... what the AP is hunting. Mechanics and context after.',
  'First-person "I" sparingly ... best when contrasting field behavior: "Many APs sit at 3 coins ... I treat 4 as the cleaner floor." Not casual "I want ≥3 trees."',
  'Direct and blunt is OK: "Don\'t be a degen", "pain in the ass", "feast or famine", "you\'ll never find one worth chasing".',
  'Short sections when the play is simple — When to stop can be one line ("You\'re done once Frenzy Mode completes").',
  'When to stop = game objective only (feature finished, meter hit). Never "when your bankroll is gone" ... Bankroll section sets the rules.',
  'Bankroll on hand: first line is always **N units** (or a range). Extra context comes after the number.',
  '"Some APs" / "field reports" — never "community consensus" or "it is important to note".',
  'Ellipses for breath ... not em dashes; same as Ryan chat voice.',
  'Skins: often just names, or one line if mechanics differ (see buffalo-link: link only).',
  'Where to find: no **Summary:** line at the end.',
  'Where to find: state **where the game is available** — property names and regions only.',
  'Where to find: no scout filler, no "when stocked", no "on X banks", no "standard hunt category", no "Reported placements include".',
  'Where to find: name **specific casinos** when documented. **Hit-or-miss by property** when nothing is known ... never invent placements.',
  'Gameplay Mechanics: how the slot **plays** only ... no AP hunt advice, no "**AP:**" / "**AP angle:**" lines.',
  'Avoid AI section headers: "Honest take:", "Field reality:", "AP reality:", "Key considerations:".',
  'Avoid AI words: leverage, utilize, ensure, delve, comprehensive, robust, navigate, landscape, "It\'s worth noting".',
]

/** Guidance strings for batch handoffs / synth prompts. */
export const AP_GUIDE_STYLE_NOTES = [
  'Sound like Ryan — read RYAN_VOICE_REFERENCE_SLUGS on test before writing.',
  ...RYAN_VOICE_TRAITS.slice(0, 4),
  'No source site names or links (MP, AP, Slot Farmers, etc.).',
  'Concise: drop redundant closers ("not a trip-worthy hunt", "verify label on glass", travel-planning lines).',
  'Skins section: usually just skin names; no parenthetical field instructions.',
  'Where to find: numbered regions only — no Summary line.',
  'Where to find: availability only — list properties/regions; cut obvious or manufacturer-padding qualifiers.',
  'Where to find (regions): add casinos inside the region line when evidence exists (e.g. **Seminole Hard Rock Tampa** / **Hollywood** for Florida tribal).',
  'Gameplay Mechanics: machine behavior only — hunt rules belong in When to play / How to check.',
  'Bankroll on hand: lead with **300 units** / **40–80 units** style — never "large bankroll" without a number.',
  'When to play: primary threshold first; "I want/I treat" only in AP-vs-Ryan contrast lines.',
]

/** Phrases that must not appear in published guide body copy. */
export const FORBIDDEN_SOURCE_PATTERNS = [
  /\bMachine Pro\b/i,
  /\bMP notes?\b/i,
  /\bAdvantage Play\b/i,
  /\bAdvantagePlay\b/i,
  /\bSlot Farmers\b/i,
  /\bSlotFarmers\b/i,
  /\bWizard of Odds\b/i,
  /\bWOO\b/,
  /\bAristocrat Players\b/i,
  /\badvantageslots\b/i,
  /\baccording to (?:MP|AP|Machine Pro|Advantage Play)\b/i,
  /\bper (?:MP|AP|Machine Pro)\b/i,
]

/** Trip-planning copy — APs walk banks at casinos they already play. */
export const TRAVEL_LANGUAGE_PATTERNS = [
  /\bcommit travel\b/i,
  /\btrip-worthy\b/i,
  /\bworth a trip\b/i,
  /\bplan a trip\b/i,
  /\btravel for (?:this|the) (?:game|title|cabinet)\b/i,
  /\bmanufacturer catalog\b/i,
]

/** Bad Where to find copy — scout filler, obvious qualifiers, manufacturer padding. */
export const WTF_SCOUT_FILLER_PATTERNS = [
  /\bscout the bank live\b/i,
  /\bscout live before you sit\b/i,
  /\binstall waves move fast\b/i,
  /\bwhat was empty last week can be full today\b/i,
  /\bwalk the bank before you\b/i,
  /\bavailability shifts with bank refreshes\b/i,
  /\bbanks rotate\b/i,
  /\bwhen stocked\b/i,
  /\bon Aristocrat banks\b/i,
  /\bon Ainsworth banks\b/i,
  /\bstandard hunt category\b/i,
  /\bReported placements include\b/i,
  /\bwith AGS pods\b/i,
  /\band similar commercial floors\b/i,
  /\band other tribal floors\b/i,
  /\band other properties\b/i,
  /\bAristocrat Buffalo banks\b/i,
  /\bProperty-specific\b/i,
  /\bdense \w+ pods\b/i,
  /\bcommercial floors with \w+ depth\b/i,
]

/** AP hunt copy belongs outside Gameplay Mechanics. */
export const GAMEPLAY_AP_PATTERNS = [
  /\*\*AP angle:\*\*/i,
  /\*\*AP:\*\*/i,
  /\bAP hunt\b/i,
  /\bin the usual AP sense\b/i,
  /\bscouting language\b/i,
  /\byou're hunting\b/i,
  /\bthat's the whole hunt\b/i,
]

/** AI-ish phrasing to avoid in Ryan-voice guides. */
export const AI_TELLS_PATTERNS = [
  /\bHonest take:/i,
  /\bField reality:/i,
  /\bAP reality:/i,
  /\bKey considerations:/i,
  /\bIt(?:'s| is) worth noting\b/i,
  /\bIt is important to note\b/i,
  /\bcommunity consensus\b/i,
  /\bIn conclusion\b/i,
  /\bleverage\b/i,
  /\butilize\b/i,
  /\bensure that\b/i,
  /\bcomprehensive\b/i,
  /\brobust\b/i,
  /\bdelve\b/i,
]

/** Do not tell readers to stop because they ran out of money — Bankroll section covers sizing. */
export const WHEN_TO_STOP_BROKE_PATTERNS = [
  /\s*\(or your session bankroll[^)]*\)/gi,
  /\s*or when your session bankroll[^.\n]*/gi,
  /\s*or you exhaust session bankroll[^.\n]*/gi,
  /quit when the session bankroll[^.\n]*\.?/gi,
  /if you dabble for fun, quit when[^.\n]*\.?/gi,
  /N\/A for AP\s*\.\.\.\s*if you dabble[^.\n]*\.?/gi,
  /when your session bankroll[^.\n]*is gone[^.\n]*\.?/gi,
]

/**
 * @param {string} md
 * @returns {string}
 */
export function scrubWhenToStopBrokeTalk(md) {
  const header = '## 🛑 When to stop'
  const start = md.indexOf(header)
  if (start < 0) return md

  const bodyStart = md.indexOf('\n', start) + 1
  const rest = md.slice(bodyStart)
  const nextIdx = rest.search(/\n## /)
  const end = nextIdx >= 0 ? bodyStart + nextIdx : md.length

  let body = md.slice(bodyStart, end)
  for (const re of WHEN_TO_STOP_BROKE_PATTERNS) {
    body = body.replace(re, '')
  }
  body = body.replace(/\n{3,}/g, '\n\n').trimEnd()

  return md.slice(0, bodyStart) + body + (end < md.length ? '\n\n' + md.slice(end).replace(/^\n+/, '') : '\n')
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function findWhenToStopBrokeTalk(text) {
  const header = '## 🛑 When to stop'
  const start = text.indexOf(header)
  if (start < 0) return []
  const rest = text.slice(start)
  const nextIdx = rest.search(/\n## /)
  const section = nextIdx >= 0 ? rest.slice(0, nextIdx) : rest
  const hits = []
  for (const re of WHEN_TO_STOP_BROKE_PATTERNS) {
    if (re.test(section)) hits.push(re.source)
    re.lastIndex = 0
  }
  if (/\bsession bankroll\b/i.test(section)) hits.push('session bankroll')
  if (/\bbankroll.*\bgone\b/i.test(section)) hits.push('bankroll gone')
  if (/\bran out of money\b/i.test(section)) hits.push('ran out of money')
  return [...new Set(hits)]
}

/** Bankroll body must open with a quantifiable unit count (Ryan card standard). */
export const BANKROLL_UNITS_LEAD_RE =
  /^(\*\*)?\d+[\d–\-,\s]*(\*\*)?\s*(units|unit)\b|\*\*Bankroll on hand:\s*\d|\*\*0\s*units/i

/**
 * @param {string} riskBankroll
 * @returns {boolean}
 */
export function bankrollStartsWithUnits(riskBankroll) {
  const first = String(riskBankroll ?? '')
    .trim()
    .split(/\n+/)[0]
    .trim()
  return Boolean(first && BANKROLL_UNITS_LEAD_RE.test(first))
}

/**
 * @param {string} text full markdown or risk_bankroll field
 * @returns {string[]}
 */
export function findWeakBankrollLead(text) {
  const header = '## 💰 Bankroll on hand'
  const start = text.indexOf(header)
  const body =
    start >= 0
      ? text.slice(start + header.length).split(/\n## /)[0].trim()
      : String(text ?? '').trim()
  if (!body) return ['missing-bankroll']
  const firstLine = body.split(/\n\n/)[0].trim()
  if (bankrollStartsWithUnits(firstLine)) return []
  return ['bankroll-missing-units-lead']
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function findAiTells(text) {
  const hits = []
  for (const re of AI_TELLS_PATTERNS) {
    if (re.test(text)) hits.push(re.source)
  }
  return hits
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function findForbiddenSourceRefs(text) {
  const hits = []
  for (const re of FORBIDDEN_SOURCE_PATTERNS) {
    if (re.test(text)) hits.push(re.source)
  }
  return hits
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function findTravelLanguage(text) {
  const hits = []
  for (const re of TRAVEL_LANGUAGE_PATTERNS) {
    if (re.test(text)) hits.push(re.source)
  }
  return hits
}

/**
 * @param {string} text full markdown or where_to_find field
 * @returns {string[]}
 */
export function findWtfScoutFiller(text) {
  const header = '## 📍 Where to find'
  const start = text.indexOf(header)
  const body =
    start >= 0
      ? text.slice(start + header.length).split(/\n## /)[0]
      : String(text ?? '')
  const hits = []
  for (const re of WTF_SCOUT_FILLER_PATTERNS) {
    if (re.test(body)) hits.push(re.source)
  }
  return hits
}

/**
 * @param {string} text full markdown or gameplay_mechanics field
 * @returns {string[]}
 */
export function findGameplayApCopy(text) {
  const header = '## 🎰 Gameplay Mechanics'
  const start = text.indexOf(header)
  const body =
    start >= 0
      ? text.slice(start + header.length).split(/\n## /)[0]
      : String(text ?? '')
  const hits = []
  for (const re of GAMEPLAY_AP_PATTERNS) {
    if (re.test(body)) hits.push(re.source)
  }
  return hits
}

/** Whole WtF lines to drop (template scout / process bullets). */
const WTF_DROP_LINE_RES = [
  /^\s*-\s+\*\*Strip\*\* and \*\*locals\*\* casinos \.\.\. scout the bank live/i,
  /^\s*-\s+Install waves move fast/i,
  /^\s*-\s+\*\*Strip\*\* and \*\*locals\*\* \.\.\. Aristocrat Buffalo banks are a standard hunt category/i,
  /^\s*-\s+Scout live before you sit \.\.\. banks rotate/i,
  /^\s*-\s+Scout the bank live before you sit/i,
  /^\s*-\s+\*\*Mine Blast\*\* uses the same math/i,
  /^\s*-\s+Scout \*\*all bet levels\*\*/i,
  /^\s*-\s+See \*\*Top cities \/ regions\*\* below/i,
  /^\s*-\s+\*\*Strip\*\*, \*\*locals\*\*, and (regional|tribal)/i,
  /^\s*-\s+Scan \*\*all bets\*\*/i,
  /^\s*-\s+Treat as a \*\*mechanics curiosity\*\*/i,
  /^\s*-\s+\*\*Legacy Spielo\*\* bank/i,
  /^\s*-\s+\*\*Very popular\*\* \*\*2020\*\* install wave/i,
  /^\s*-\s+Common on tribal and commercial/i,
  /^\s*-\s+\*\*2020\*\* Light & Wonder orb installs/i,
  /^\s*-\s+\*\*AGS 2021\*\* coin-holder installs/i,
  /^\s*-\s+\*\*2024\*\* IGT.*walk-by/i,
  /^\s*-\s+\*\*Gaming Arts S104 Hybrid\*\*/i,
]

/**
 * Scrub WtF body (field content, not full markdown). Preserves Ryan custom blocks.
 * @param {string} wtf
 * @returns {string}
 */
export function scrubWtfBody(wtf) {
  let text = String(wtf ?? '').trim()
  if (!text) return text

  text = text.replace(/\n\*\*Summary:\*\*[\s\S]*$/i, '').trim()

  /** @param {string} line */
  function cleanLine(line) {
    let l = line
    if (/^\s*-\s*Reported placements include\s+/i.test(l)) {
      l = l.replace(/^\s*-\s*Reported placements include\s+/i, '- ')
    }
    if (/^\s*-\s*Reported AGS placements include\s+/i.test(l)) {
      l = l.replace(/^\s*-\s*Reported AGS placements include\s+/i, '- ')
    }
    // Replace vague region tails with hit-or-miss
    if (/^\d+\.\s/.test(l)) {
      l = l
        .replace(/ - Tribal floors with dense Ainsworth pods$/i, ' - Hit-or-miss by property')
        .replace(/ - Commercial floors with Ainsworth depth$/i, ' - Hit-or-miss by property')
        .replace(/ - Present; verify live on the bank$/i, ' - Hit-or-miss by property')
        .replace(/ - Tribal and commercial AGS pods$/i, ' - Hit-or-miss by property')
        .replace(/ - Property-specific AGS banks$/i, ' - Hit-or-miss by property')
    }
    l = l
      .replace(/\s+when stocked\b/gi, '')
      .replace(/\s+on newer Ainsworth banks\b/gi, '')
      .replace(/\s+on Aristocrat banks\b/gi, '')
      .replace(/\s+on Ainsworth banks\b/gi, '')
      .replace(/\s+and other tribal floors\b/gi, '')
      .replace(/\s+and similar commercial floors\b/gi, '')
      .replace(/\s+and other properties\b/gi, '')
      .replace(/, and other locals floors\b/gi, '')
      .replace(/\s+with AGS pods\b/gi, '')
      .replace(/,\s*$/g, '')
      .replace(/\s*\.\.\.\s*scout live before you sit[^.]*\.?$/i, '')
      .replace(/\s*\.\.\.\s*banks rotate\.?$/i, '')
      .replace(/\s*\.\.\.\s*availability shifts[^.]*\.?$/i, '')
    return l.trimEnd()
  }

  const lines = text.split('\n')
  /** @type {string[]} */
  const out = []
  for (const raw of lines) {
    if (WTF_DROP_LINE_RES.some((re) => re.test(raw))) continue
    if (/^\s*-\s*$/.test(raw)) continue
    const cleaned = cleanLine(raw)
    if (cleaned) out.push(cleaned)
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/,\s*\./g, '.')
    .replace(/\*\*In Las Vegas \/ physical casinos:\*\*\s*\n(?=\*\*Online)/i, '')
    .replace(/\*\*In Las Vegas \/ physical casinos:\*\*\s*\n(?=### Top cities)/i, '')
}

/**
 * Scrub Gameplay Mechanics body — machine behavior only.
 * @param {string} body
 * @returns {string}
 */
export function scrubGameplayBody(body) {
  const lines = String(body ?? '').split('\n')
  /** @type {string[]} */
  const out = []
  for (let line of lines) {
    const t = line.trim()
    if (/^\*\*AP angle:\*\*/i.test(t)) continue
    if (/^\*\*AP:\*\*/i.test(t)) continue
    if (/in the usual AP sense/i.test(t)) continue
    if (/scouting language/i.test(t)) continue
    line = line.replace(
      /\*\*Not MHB:\*\* you're hunting \*\*expected bonus size\*\*, not a forced hit window\./gi,
      '**Not must-hit-by:** a high meter count does not force a trigger.',
    )
    line = line.replace(/\s*Ultimate Fire Link-adjacent family with the same one-away scouting language\.?\s*/gi, '')
    line = line.replace(/\s*\.\.\. no sticky coin timers or shared must-hit counters in the usual AP sense\.?\s*/gi, '.')
    if (line.trim()) out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Apply in-place voice scrubs to compiled guide markdown (preserves Ryan edits).
 * @param {string} md
 * @returns {string}
 */
export function scrubGuideMarkdownVoice(md) {
  const header = '## 📍 Where to find'
  let out = scrubWhenToStopBrokeTalk(md)

  const wtfStart = out.indexOf(header)
  if (wtfStart >= 0) {
    const bodyStart = out.indexOf('\n', wtfStart) + 1
    const rest = out.slice(bodyStart)
    const nextIdx = rest.search(/\n## /)
    const end = nextIdx >= 0 ? bodyStart + nextIdx : out.length
    const scrubbed = scrubWtfBody(out.slice(bodyStart, end))
    out = out.slice(0, bodyStart) + scrubbed + (end < out.length ? out.slice(end) : '')
  }

  const gpHeader = '## 🎰 Gameplay Mechanics'
  const gpStart = out.indexOf(gpHeader)
  if (gpStart >= 0) {
    const bodyStart = out.indexOf('\n', gpStart) + 1
    const rest = out.slice(bodyStart)
    const nextIdx = rest.search(/\n## /)
    const end = nextIdx >= 0 ? bodyStart + nextIdx : out.length
    const scrubbed = scrubGameplayBody(out.slice(bodyStart, end))
    out = out.slice(0, bodyStart) + scrubbed + (end < out.length ? out.slice(end) : '')
  }

  return out.trimEnd() + '\n'
}
