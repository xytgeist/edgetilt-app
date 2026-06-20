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
  /** Where to find: optional section — Ryan fills via slot-guide-form; batch synth must omit. */
  whereToFindFormat: 'lightning-numbered-regions-no-summary-no-travel',
  /** Batch synth: never draft Where to find — Ryan adds install data in slot-guide-form after ingest. */
  whereToFindBatchSynth: 'omit-ryan-fills-via-form',
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
  /** How to check: **checker ticket** when cycling bets needs balance — not "pay to check". */
  howToCheckCheckerTicket: 'checker-ticket-not-pay-to-check',
  /** card_ev_threshold renders as plain text on the card — never **bold**, links, or other markdown. */
  cardEvThresholdPlainText: true,
  /** risk_bankroll = bold unit count only in markdown body (e.g. **15–30 units**). No trailing prose after units. */
  bankrollUnitsOnly: true,
  /** Batch synth: wrap unit count in ** for Bankroll on hand section display. */
  bankrollBoldUnits: true,
  /** Ryan's standard H2 for How to check — plain header, no "(quick/easy)". */
  howToCheckHeader: '## 🔍 How to check',
  /** Default bet-scout line when state is per bet/denom. */
  howToCheckCycleBetsDefault: 'Cycle through all bets/denoms',
  /** How to check body: plain statement(s) by default — not numbered lists. */
  howToCheckFormat: 'plain-statement-not-numbered-list',
  /** Same-engine theme clones → one slug/card by default; split when glass/theme confuses new users (Fu Ren Wu). */
  skinFamilyMerge: 'one-card-per-engine-unless-theme-split',
}

/**
 * Published guides Ryan has edited — read these on test before batch synth for voice.
 * Full set (91 slugs) synced from test `guides.slug` via
 * `node scripts/ap-guide-backup-test-guides.mjs --all-published` (2026-06-19 voice audit).
 * Snapshot: `ap-guide-workspace/_guide-backups/*-ryan-voice-audit-all-published.json`
 */
export const RYAN_VOICE_REFERENCE_SLUGS = [
  '5-coin-frenzy-jackpots',
  '88-fortunes-emperors-coins',
  'ags-must-hit-by',
  'ainsworth-must-hit-by',
  'aladdins-fortune',
  'alien-heroes',
  'angel-blade-sword-of-destiny',
  'ascending-fortunes',
  'aztec-adventures-wuwu-coins',
  'aztec-banner',
  'aztec-vault-cleopatras-vault',
  'azure-dragon-emerald-guardian',
  'bier-bier-bier-mai-tai-money',
  'big-ocean-jackpots',
  'bigger-fu-cash-bats',
  'blazin-diamond-lightning-wilds',
  'blazing-x',
  'block-bonanza-hawaii-rio',
  'blooming-penzai',
  'bonus-builder-emerald-spins',
  'brave-firefighter',
  'brian-christophers-world-cruise',
  'bubble-blast',
  'bubble-mania',
  'buffalo-ascension',
  'buffalo-cash',
  'buffalo-diamond',
  'buffalo-diamond-extreme',
  'buffalo-instant-hit',
  'buffalo-link',
  'buffalo-power-pay',
  'bustin-money',
  'cai-fu-long',
  'captain-riches-tiki-fortune',
  'cash-burst-orb-of-atlantis-force-of-babylon',
  'cash-cano-roman-riches-tiki',
  'cash-eruption',
  'cash-falls-huo-zhu-pirate-s-trove-island-bounty-outback-bounty',
  'cash-quest',
  'cash-up-jackpots',
  'cash-wizard-magic-trio',
  'cashman-bingo',
  'cashman-double-bingo',
  'cats-wild-serengeti',
  'cherry-chance',
  'clover-link-xtreme',
  'coin-catch',
  'coin-combo-hurricane-horse-perfect-peacock',
  'coin-kingdom-aztec',
  'colossal-titans',
  'congo-cash',
  'crackin-cash-grand-venezia-rio-wonder',
  'crush-conquest',
  'crush-dynasty',
  'cyber-dragon',
  'dancing-drums-golden-drums',
  'dancing-phoenix-soaring-dragon',
  'dawn-of-ra-sun-of-ra-wild-pyramid-respins',
  'diamond-blast',
  'diamond-collector-wolfpack-elite-7s',
  'diamond-mania',
  'diamond-tide-jungle',
  'dice-seeker-flappers-dappers-heroes-villains-viking-invasion',
  'double-dragon-jin-long-jin-bao',
  'double-jackpot-blazing-7s-with-quick-hit-feature-high-limit-edition',
  'dragon-flame',
  'dragon-jin-long-jin-bao',
  'dragon-lanterns',
  'dragon-lights-fortune-skies-mystical-falls-secret-fortress',
  'dragon-rush-fei-jin-fei-nu',
  'dragon-spell',
  'dragon-spin-crosslink-air-earth-fire-water',
  'dragon-unleashed-prosperity-packets-red-fleet-three-legends-treasured-happin',
  'dragons-orb-jackpots',
  'duo-fu-duo-cai-grand-dragons',
  'duo-fu-duo-cai-grand-ingotcha',
  'eagle-ascension',
  'egyptian-stars',
  'electro-max',
  'elephant-king',
  'epic-fortunes-blast-chance-power-peach',
  'extreme-wild-lanterns',
  'extreme-wild-stars',
  'fairy-hollow',
  'farmville',
  'farmville-golden-harvest',
  'fat-fortunes-fat-cat-puffy-penguin-jelly-jams',
  'fu-ren-wu',
  'gift-of-the-nile',
  'golden-egypt',
  'igt-must-hit-by',
  'legend-of-the-phoenix',
  'lightning-10-year-storm',
  'lightning-buffalo-link',
  'luckymon-evolutions',
  'pegasus-banner',
  'phoenix-link',
  'scarab',
  'stack-up-pays',
  'wolf-peak-cat-peak-fu-ren-wu',
  'wolf-run-eclipse',
]

/**
 * Distilled from Ryan's live test DB copy (91 published guides, 2026-06-19 audit).
 * Use with RYAN_VOICE_REFERENCE_SLUGS — not a substitute for reading the cards.
 */
export const RYAN_EDITED_VOICE_AUDIT = {
  auditedAt: '2026-06-19',
  publishedCount: 101,
  snapshotGlob: 'ap-guide-workspace/_guide-backups/*-ryan-voice-audit-all-published.json',
  patterns: {
    howToCheckHeader: '## 🔍 How to check (Ryan preference; legacy cards may still say "(quick/easy)")',
    whenToStop: 'Usually 1–3 lines; mechanical objective only (feature done, meter hit, board cleared)',
    whenToPlayLeads: '**Primary play:** (~40 cards), **Simple read:** (queue/wild games), **Quick check:** (floor shortcut before exact rules)',
    heuristics: 'When rules are long, Ryan adds a plain-English floor shortcut after "memorize the rule-set" (diamond-mania, scarab, cashman-bingo, cash-falls family)',
    multiAdvantage: '### Advantage 1 / Advantage 2 subheaders when hunts are independent (88-fortunes-emperors-coins)',
    bankroll: 'Lead with **N units** or a range sized to the chase; "reinforcements on call" OK on long MHB grinds',
    whereToFind: 'Ryan fills post-ingest; named casinos + honest rotation prose; omit section when footprint adds nothing (8 cards: golden-egypt, dancing-phoenix, buffalo-link, etc.)',
    sisterCards: 'Split theme clones share hunt copy; Skins = single opposite title + [guide:slug] link; each card gets its own hero in form',
    inlineImages: 'Ryan uploads section images via form (How to check, Skins, When to play) — 61/91 cards have at least one',
    heroes: 'All 91 published cards have thumbnail_url set in form',
    noOakShorthand: 'Use "3 of a kind" / "4 of a kind" — never 3oak/4oak (4 slugs still had oak in audit; Ryan flagged diamond-mania re-ingest)',
    bluntVoice: '"Don\'t be a degen", competition/vulture notes, "move on with your life" when a secondary angle isn\'t worth checking',
    riskSection: 'Median ~179 chars. ONE gotcha/trap APs miss — not mechanics recap, not hunt thresholds, not RTP essay. Good: "Grape ends the feature on one spin." Bad: restating how coins/wilds lock.',
    howToCheckSection: 'Median ~222 chars. Plain statement(s): where to read state, then **Cycle through all bets/denoms** when persistence is per bet. Numbered lists optional — not the default. No play filters, no feature rules.',
  },
  slugsWithoutWhereToFind: [
    'aztec-banner',
    'buffalo-link',
    'dancing-phoenix-soaring-dragon',
    'eagle-ascension',
    'golden-egypt',
    'legend-of-the-phoenix',
    'lightning-buffalo-link',
    'pegasus-banner',
  ],
}

/**
 * Reference when **Ryan** (or a directed manual edit) fills **Where to find** in slot-guide-form.
 * **Batch synth agents: do not run this — leave `where_to_find` empty / omit the field.**
 *
 * Published copy: property names + regions only. Do not cite YouTube, slot finders, or Grok in the guide.
 *
 * @type {string[]}
 */
export const WHERE_TO_FIND_RESEARCH_STEPS = [
  '1. **Broad discovery:** `"<exact title>" slot casino`, `"<title>" Las Vegas`, `"<title>" <manufacturer> floor`.',
  '2. **Casino slot finders (strongest signal):** search operator tools — e.g. Boyd `site:boydgaming.com "<title>"`, per-property `site:cannery.boydgaming.com`, tribal/commercial casino slot-search pages. A name match on the finder = list the property.',
  '3. **Per-property site search:** `"<title>" site:<casino-domain>` for properties that publish slot lineups or "what\'s new" pages.',
  '4. **Secondary floor proof:** recent player video / social (`"<title>" Aliante`, `"<title>" El Cortez`) — weaker than a slot finder; OK to list when multiple reports align. Never link or name YouTube in guide copy.',
  '5. **Negative check:** query major properties you might assume (`"<title>" Bellagio`, MGM, Caesars, Wynn, etc.). If zero hits on a new title, write **Not widely reported yet.** as its own line ... no Strip laundry list after it.',
  '6. **Rollout inference (soft only):** if several Boyd (or one operator chain) properties list it, you may note **likely siblings (unconfirmed)** — never present pattern-matching as confirmed.',
  '7. **Write the section:** Vegas bullets = confirmed + clearly labeled likely/unconfirmed. Numbered regions = documented properties on the region line, else **hit-or-miss by property**. No scout closers, no **Summary:** line, no URLs.',
  '8. **Common / widespread footprint:** if the title is on **nearly all Vegas casinos** (or clearly common Strip + locals), say that in one plain Vegas line ... short nationwide list only when you have named properties. Do not pad with tribal region stacks, rollout hedging, or repeated **hit-or-miss** when footprint is obviously broad.',
]

/**
 * Confidence labels for Where to find bullets (use in prose, not as a table in the card).
 * @type {Record<string, string>}
 */
export const WHERE_TO_FIND_CONFIDENCE = {
  confirmed: 'Slot finder or official casino slot page lists the exact title.',
  reported: 'Multiple recent floor reports / player video at that property (no finder hit).',
  likely: 'Same operator rollout pattern — label **unconfirmed** or **likely**.',
  absent: 'Title-specific search found no hits at that property or market — OK to say **not widely reported yet**.',
}

/**
 * Ryan voice traits (from his edited cards — not AI polish).
 * @type {string[]}
 */
export const RYAN_VOICE_TRAITS = [
  'Batch synth: **omit where_to_find** — leave empty or drop the field. Ryan fills **Where to find** in `/slot-guide-form` when he has real install data. No web search, no `wtf()`, no tribal/region filler during batch builds.',
  'How to check header: **`## 🔍 How to check`** ... no "(quick/easy)" suffix.',
  'When to play: **Primary play:** / **Simple read:** / **Quick check:** first ... hunt threshold before mechanics primer.',
  'When to play: complex rule-sets get a **heuristic** or **Quick check** line after "memorize the exact rule-set" (see diamond-mania, scarab, cashman-bingo). Never replace the full rules ... shortcut is for busy floor checks.',
  'When to play: multi-hunt cabinets use **### Advantage 1 / Advantage 2** subheaders when angles are independent (88 Fortunes Emperor\'s Coins).',
  'When to play: **Field range:** / **Some APs** contrast lines OK; **Honest take:** OK when Ryan is dismissing a secondary angle that field lore overhypes.',
  'First-person "I" sparingly ... best when contrasting field behavior: "Many APs sit at 3 coins ... I treat 4 as the cleaner floor." Not casual "I want ≥3 trees."',
  'Direct and blunt is OK: "Don\'t be a degen", "pain in the ass", "feast or famine", "move on with your life", "you\'ll never find one worth chasing".',
  'Short sections when the play is simple — When to stop can be one line ("You\'re done once Frenzy Mode completes").',
  'When to stop = game objective only (feature finished, meter hit, board cleared). Never "when your bankroll is gone" ... Bankroll section sets the rules.',
  'Once seated on +EV, play until the feature hits. Bankroll sizes the upfront commitment ... never "loss cap", "walk", or "call it a loss" mid-chase.',
  'Bankroll on hand: **unit count only** — write `**15–30 units**` or `**100 units**` (bold the units). No trailing prose or ellipses after units.',
  '"Some APs" / "field reports" — never "community consensus" or "it is important to note".',
  'Ellipses for breath ... not em dashes; same as Ryan chat voice.',
  'Poker shorthand: write **3 of a kind** / **4 of a kind** / **5 of a kind** ... never **3oak**, **4oak**, **5oak**.',
  'Skins: sister split cards = **single opposite skin name** + `[Title](guide:slug)` cross-link (golden-egypt ↔ dancing-phoenix, diamond-mania ↔ scarab, dragon-flame ↔ gift-of-the-nile).',
  'Skins: MHB / family reference cards = comma-separated skin list (ags-must-hit-by). **No separate skins.** alone is enough when true.',
  'Skins: often just names, or one line if mechanics differ (see buffalo-link: link only).',
  'Inline images: Ryan adds via form in How to check, Skins, When to play when a screenshot helps ... batch synth text-only unless a static asset already exists in repo.',
  'Where to find (Ryan manual only): no **Summary:** line at the end.',
  'Where to find (Ryan manual only): state **where the game is available** — property names and regions only.',
  'Where to find (Ryan manual only): honest rotation prose beats scout filler ("many floors have rotated these out"). Named casinos when confirmed (Orleans, Sam\'s Town, Cosmopolitan).',
  'Where to find (Ryan manual only): OK to **omit the whole section** when footprint adds nothing (golden-egypt, dancing-phoenix sister cards, some Lightning Link skins).',
  'Where to find (Ryan manual only): follow WHERE_TO_FIND_RESEARCH_STEPS when Ryan asks for help — never paste WTF_VEGAS_* / WTF_REGIONS_* without a title hit.',
  'Where to find (Ryan manual only): **whenever possible, name specific casinos** with confirmed or reported installs. Label **unconfirmed** / **likely** when inferring from operator rollout.',
  'Where to find (Ryan manual only): no scout filler, no "when stocked", no "on X banks", no "standard hunt category", no "Reported placements include".',
  'Where to find (Ryan manual only): when no property is documented, use **hit-or-miss by property** or region-only ... never invent casino names.',
  'Gameplay Mechanics: how the slot **plays** only ... no AP hunt advice, no "**AP:**" / "**AP angle:**" lines.',
  'Avoid AI section headers: "Field reality:", "AP reality:", "Key considerations:" (Honest take: is Ryan-voice when earned).',
  'Avoid AI words: leverage, utilize, ensure, delve, comprehensive, robust, navigate, landscape, "It\'s worth noting".',
  'When to play: no meta framing ("pick one before you coin in", "two hunts") ... jump straight into thresholds.',
  'How to check: **plain statement(s)** by default — e.g. "Add all prize values on bubbles in rows 2+." Numbered lists are optional, not required.',
  'How to check: scouting only (read board, count units, verify timers). Default bet scout line: **Cycle through all bets/denoms** (not "cycle bet levels"). Checker-ticket / without-coin-in only when that install requires it.',
  'How to check: **never** filter plays here — no "ignore/skip/pass/avoid/do not count" on coins, reels, rows, balls, pots, or cracked symbols. That belongs in When to play.',
  'How to check: no feature mechanics ("line pays are X only", "three coins → wild reel", "six scatters trigger bonus"). Gameplay Mechanics owns that.',
  'How to check: no buy-bonus prompts, execution tactics, or "after a big hit flip bets" ... scout state only.',
  'How to check: when cycling bets/denoms needs balance, **insert checker ticket** first (small balance, usually under $1) ... not "pay to check", "must insert coin", or "must put money in".',
  'Risk summary: **one gotcha** APs might miss — trap symbol, wrong panel, timer quirk, competition note. Not a second When to play.',
  'Risk summary: **no mechanics recap** — no "→ wild reel", "hold-and-spin launches", "free games keep multipliers", ways counts, or how the feature pays.',
  'Risk summary: **no generic variance filler** alone — cut "feast or famine", "variance is extreme", "you need volume", RTP bands unless it is the actual trap (MHB weighting OK).',
  'Risk summary: **no engine/family name-drops** ("cousin to X", "same math as Y") ... Skins section or a one-line cross-link if needed.',
  'Risk summary: checker-ticket note belongs here when bet cycling needs a small balance ... not in How to check as a vague paywall.',
  'Risk & Warnings: one line is fine when that is all the play needs ... do not pad with verbose caveats.',
  'Where to find (Ryan manual only): never paste WTF_VEGAS_* templates for brand-new titles without field evidence; verify installs or say what is unconfirmed.',
  'Skins: "No separate skins." alone is enough ... do not explain character/feature names unless they are true alternate cabinet themes.',
  'card_ev_threshold: glass-style one-liner on the card face (what you scan before you sit) — **plain text only** (UI does not render markdown; no **bold**, backticks, or links).',
]

/** Guidance strings for batch handoffs / synth prompts. */
export const AP_GUIDE_STYLE_NOTES = [
  'Batch synth: **omit where_to_find** — Ryan fills via `/slot-guide-form` after ingest. Do not web-search installs or call `wtf()` in payloads.',
  'Sound like Ryan — read RYAN_VOICE_REFERENCE_SLUGS on test (or RYAN_EDITED_VOICE_AUDIT snapshot) before writing.',
  ...RYAN_VOICE_TRAITS.slice(1, 8),
  'No source site names or links (MP, AP, Slot Farmers, etc.).',
  'Concise: drop redundant closers ("not a trip-worthy hunt", "verify label on glass", travel-planning lines).',
  'Skins section: usually just skin names; no parenthetical field instructions.',
  'Gameplay Mechanics: machine behavior only — hunt rules belong in When to play / How to check.',
  'Bankroll on hand: **N units** bold only (`**15–30 units**`, `**100 units**`) ... no extra phrasing after the number.',
  'When to play: primary threshold first; "I want/I treat" only in AP-vs-Ryan contrast lines.',
  'When to play: no preamble framing lines ... thresholds first.',
  'How to check: plain prose scout copy ... no "stop immediately" or execution tactics.',
  'How to check: default cycle line = **Cycle through all bets/denoms** ... not "cycle bet levels" / "cycle denoms and bet keys".',
  'How to check: no ignore/skip/pass/avoid/do not count — play filters belong in When to play.',
  'How to check: **checker ticket** when bet cycling needs balance ... never "pay to check" / "must insert coin".',
  'Risk: **one gotcha** only — trap symbol, wrong panel, timer quirk. Not mechanics, not hunt thresholds, not RTP essay.',
  'Risk: no "→ wild reel", ways counts, hold-and-spin rules, "feast or famine", or "same math as X".',
  'Risk: 1–2 sentences max (~280 chars) for batch synth.',
  'Skins: "No separate skins." needs no follow-up sentence.',
  'card_ev_threshold: write exactly how it should read on the card — plain text, no markdown syntax.',
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
  /\bavailability moves fast\b/i,
  /\bfloor walk\b/i,
  /\bask an attendant\b/i,
  /\bscout blind\b/i,
  /\bbefore you scout\b/i,
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

/** Poker shorthand Ryan rejects — use plain "N of a kind" instead. */
export const OAK_SHORTHAND_PATTERNS = [
  /\b3oak\b/i,
  /\b4oak\b/i,
  /\b5oak\b/i,
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

/** Risk copy — no mid-chase walk-away advice (bankroll sizes upfront commitment). */
export const RISK_WALK_AWAY_PATTERNS = [
  /\bloss cap\b/i,
  /\bcall it a loss\b/i,
  /\bset a budget[^.\n]*move on\b/i,
  /\bset a loss cap\b/i,
  /\babandon the play\b/i,
  /\bwalk away mid\b/i,
]

/** Batch synth Risk — mechanics recap belongs in Gameplay Mechanics, not Risk. */
export const RISK_MECHANICS_RECAP_PATTERNS = [
  /\→/,
  /\bhold-and-spin\b/i,
  /\bfree games\b.*\b(?:keep|award|trigger|launch)\b/i,
  /\bturns?\s+wild\b/i,
  /\bwild\s+reel\b/i,
  /\b\d{1,3}[,]\d{3}\s+ways\b/i,
  /\bRTP\b/i,
  /\b\d+\s*spins?\b.*\b(?:wild|lock|persist)\b/i,
  /\b(?:three|four|five|six)\s+(?:coins?|scatters?|symbols?).*(?:trigger|launch|award)\b/i,
  /\bline pays are\b/i,
  /\bbees refill\b/i,
  /\bengine cousin\b/i,
  /\bsame math as\b/i,
  /\bsame family as\b/i,
  /\bidentical math\b/i,
]

/** Batch synth Risk — generic variance padding without a specific gotcha. */
export const RISK_GENERIC_FILLER_PATTERNS = [
  /\bfeast or famine\b/i,
  /\bvariance is (?:high|extreme|brutal)\b/i,
  /\byou need volume\b/i,
  /\bmost sessions are\b/i,
  /\bbankroll risk\b/i,
  /\blow bankroll risk\b/i,
  /\bcan run cold\b/i,
  /\bgrinds can hurt\b/i,
  /\bextreme variance\b/i,
  /\bhighly volatile\b/i,
  /\bHIGHLY VOLATILE\b/,
]

/** How to check — play decisions belong in When to play (scout exclusions like "ignore top row" are OK). */
export const HOW_TO_CHECK_PLAY_FILTER_PATTERNS = [
  /\bignore\b.*(?:\d+-coin|full column|cracked|pot fill|fake pick|already at)/i,
  /\bskip\b/i,
  /\bpass\b.*(?:board|play|two-coin|one-away)/i,
  /\bavoid playing\b/i,
  /\bdo not count\b/i,
  /\bnot a play\b/i,
  /\bbuy bonus\b/i,
  /\bnever sit\b/i,
]

/** How to check — feature rules / execution tactics. */
export const HOW_TO_CHECK_TACTICS_PATTERNS = [
  /\bafter a big\b/i,
  /\bflip bet\b/i,
  /\bline pays are\b/i,
  /\btrigger(?:s|ed)?\b.*\bbonus\b/i,
  /\b→\b/,
  /\bneeded for bonus\b/i,
  /\bexecution\b/i,
  /\bstop immediately\b/i,
]

/** Canonical How to check bet-scout phrase (Ryan default). */
export const HOW_TO_CHECK_CYCLE_BETS_DEFAULT = 'Cycle through all bets/denoms'

/** Batch synth variants that should use the canonical cycle line instead. */
export const HOW_TO_CHECK_CYCLE_BETS_NONSTANDARD_RE =
  /\bcycle\s+(?:bet levels?|bets?|denoms?(?:\s+and\s+bet keys?)?|every bet)\b/i

/**
 * @param {string} howToCheck
 * @returns {string[]}
 */
export function findHowToCheckNonstandardCycleLine(howToCheck) {
  const body = String(howToCheck ?? '')
  if (!body.trim()) return []
  if (!HOW_TO_CHECK_CYCLE_BETS_NONSTANDARD_RE.test(body)) return []
  if (/\bcycle through all bets\/denoms\b/i.test(body)) return []
  return ['htc-nonstandard-cycle-line']
}

/** Batch synth length caps (Ryan median risk ~179 chars, HTC ~222 — synth runs long). */
export const BATCH_SYNTH_RISK_MAX_CHARS = 280
export const BATCH_SYNTH_HTC_MAX_CHARS = 320
/** Only flag numbered lists when synth pads with MHB-style step laundry (Ryan uses plain prose). */
export const BATCH_SYNTH_HTC_MAX_NUMBERED_STEPS = 5

/**
 * @param {string} text
 * @param {string} header
 * @returns {string}
 */
export function extractGuideSection(text, header) {
  const start = String(text ?? '').indexOf(header)
  if (start < 0) return ''
  const bodyStart = text.indexOf('\n', start) + 1
  const rest = text.slice(bodyStart)
  const nextIdx = rest.search(/\n## /)
  return (nextIdx >= 0 ? rest.slice(0, nextIdx) : rest).trim()
}

/**
 * @param {string} howToCheck
 * @returns {number}
 */
export function countHowToCheckSteps(howToCheck) {
  const lines = String(howToCheck ?? '')
    .trim()
    .split(/\n+/)
    .filter((l) => /^\s*\d+\.\s/.test(l))
  return lines.length
}

/**
 * @param {string} howToCheck
 * @returns {string[]}
 */
export function findHowToCheckSuperfluity(howToCheck) {
  const body = String(howToCheck ?? '').trim()
  if (!body) return ['missing-how-to-check']
  const hits = []
  for (const re of HOW_TO_CHECK_PLAY_FILTER_PATTERNS) {
    if (re.test(body)) hits.push(`htc-play-filter:${re.source}`)
    re.lastIndex = 0
  }
  for (const re of HOW_TO_CHECK_TACTICS_PATTERNS) {
    if (re.test(body)) hits.push(`htc-tactics:${re.source}`)
    re.lastIndex = 0
  }
  const steps = countHowToCheckSteps(body)
  if (steps > BATCH_SYNTH_HTC_MAX_NUMBERED_STEPS) hits.push(`htc-too-many-numbered-steps:${steps}`)
  if (body.length > BATCH_SYNTH_HTC_MAX_CHARS) hits.push(`htc-too-long:${body.length}`)
  hits.push(...findHowToCheckNonstandardCycleLine(body))
  return [...new Set(hits)]
}

/**
 * @param {string} text
 * @returns {number}
 */
export function countRiskSentences(text) {
  const normalized = String(text ?? '')
    .replace(/\.\.\./g, '…')
    .trim()
  if (!normalized) return 0
  return normalized.split(/(?<=[.!?])\s+/).filter(Boolean).length
}

/**
 * @param {string} riskSummary
 * @returns {string[]}
 */
export function findRiskSuperfluity(riskSummary) {
  const body = String(riskSummary ?? '').trim()
  if (!body) return ['missing-risk-summary']
  const hits = []
  for (const re of RISK_MECHANICS_RECAP_PATTERNS) {
    if (re.test(body)) hits.push(`risk-mechanics:${re.source}`)
    re.lastIndex = 0
  }
  for (const re of RISK_GENERIC_FILLER_PATTERNS) {
    if (re.test(body)) hits.push(`risk-filler:${re.source}`)
    re.lastIndex = 0
  }
  if (body.length > BATCH_SYNTH_RISK_MAX_CHARS) hits.push(`risk-too-long:${body.length}`)
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim())
  if (paragraphs.length > 1) hits.push(`risk-too-many-paragraphs:${paragraphs.length}`)
  const sentences = countRiskSentences(body)
  if (sentences > 2) hits.push(`risk-too-many-sentences:${sentences}`)
  return [...new Set(hits)]
}

/**
 * @param {string} text full markdown or section field
 * @returns {string[]}
 */
export function findHowToCheckSuperfluityInMarkdown(text) {
  const header = AP_GUIDE_VOICE_RULES.howToCheckHeader
  const alt = '## 🔍 How to check (quick/easy)'
  const body = extractGuideSection(text, header) || extractGuideSection(text, alt)
  return findHowToCheckSuperfluity(body)
}

/**
 * @param {string} text full markdown or risk_summary field
 * @returns {string[]}
 */
export function findRiskSuperfluityInMarkdown(text) {
  const body =
    extractGuideSection(text, '## ⚠️ Risk & Warnings') || String(text ?? '').trim()
  return findRiskSuperfluity(body)
}

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

/**
 * @param {string} text full markdown or risk fields
 * @returns {string[]}
 */
export function findRiskWalkAway(text) {
  const header = '## ⚠️ Risk & Warnings'
  const start = text.indexOf(header)
  const body =
    start >= 0
      ? text.slice(start + header.length).split(/\n## /)[0]
      : String(text ?? '')
  const hits = []
  for (const re of RISK_WALK_AWAY_PATTERNS) {
    if (re.test(body)) hits.push(re.source)
    re.lastIndex = 0
  }
  return hits
}

/** Bankroll body must open with a quantifiable unit count (Ryan card standard). */
export const BANKROLL_UNITS_LEAD_RE =
  /^(\*\*)?\d+[\d–\-,\s]*(\*\*)?\s*(units|unit)\b|\*\*Bankroll on hand:\s*\d|\*\*0\s*units/i

/**
 * @param {string} riskBankroll
 * @returns {boolean}
 */
/**
 * card_ev_threshold is rendered as plain text on guide cards — markdown must not be used.
 * @param {string} threshold
 * @returns {string[]}
 */
export function findMarkdownInEvThreshold(threshold) {
  const t = String(threshold ?? '').trim()
  if (!t) return []
  const bad = []
  if (/\*\*/.test(t)) bad.push('ev-threshold-markdown-bold')
  if (/`/.test(t)) bad.push('ev-threshold-markdown-code')
  if (/\[[^\]]+\]\([^)]+\)/.test(t)) bad.push('ev-threshold-markdown-link')
  if (/^#{1,6}\s/m.test(t)) bad.push('ev-threshold-markdown-heading')
  return bad
}

/** Bankroll synth: unit count only — no prose after "units". Allows **N units** wrap. */
export const BANKROLL_UNITS_ONLY_RE =
  /^(\*\*)?\d+[\d–\-,\s]*(\*\*)?\s*(units|unit)(\*\*)?\s*$/i

/**
 * Batch synth bankroll must be only the unit line (Ryan 2026-06-19).
 * @param {string} riskBankroll
 * @returns {string[]}
 */
export function findBankrollExtraProse(riskBankroll) {
  const first = String(riskBankroll ?? '')
    .trim()
    .split(/\n+/)[0]
    .trim()
  if (!first) return ['missing-bankroll']
  if (!bankrollStartsWithUnits(first)) return ['bankroll-missing-units-lead']
  if (!BANKROLL_UNITS_ONLY_RE.test(first)) return ['bankroll-extra-prose']
  return []
}

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
export function findOakShorthand(text) {
  const hits = []
  for (const re of OAK_SHORTHAND_PATTERNS) {
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
