/**
 * Where to find blocks for AP guide batches.
 *
 * **Batch synth: do not use.** Ryan fills **Where to find** in `/slot-guide-form` after ingest.
 * Keep this module for Ryan-directed manual patches or one-off scripts only.
 *
 * When Ryan (or a directed edit) drafts copy: state where the game is available —
 * properties and regions only. See WHERE_TO_FIND_RESEARCH_STEPS in apGuideVoiceRules.mjs.
 */

/** Default when no Vegas-specific placements are known. */
export const WTF_VEGAS_DEFAULT = `- See **Top cities / regions** below.`

/** Aristocrat Buffalo-family (Phoenix Link / Buffalo Ascension guides on test). */
export const WTF_VEGAS_ARISTOCRAT_BUFFALO = `- **Bellagio**, **Aria**, **MGM Grand**, **Caesars Palace**, **Wynn / Encore**, **Venetian / Palazzo**, **Red Rock**.`

/** Light & Wonder persistent-family (Phoenix Link guide on test). */
export const WTF_VEGAS_LNW_COMMON = `- **Bellagio**, **Aria**, **MGM Grand**, **Caesars Palace**, **Wynn / Encore**, **Venetian / Palazzo**, **Red Rock**.`

/** AGS (AGS Must Hit By guide on test). */
export const WTF_VEGAS_AGS = `- **MGM Grand**, **New York-New York**, **Luxor**, **Excalibur**.`

/** Generic numbered regions. */
export const WTF_REGIONS_DEFAULT = [
  '1. **Oklahoma tribal** - Medium - Hit-or-miss by property',
  '2. **California tribal** - Medium - Hit-or-miss by property',
  '3. **Pennsylvania / Midwest commercial** - Low-Medium - Hit-or-miss by property',
  '4. **Florida tribal** - Low-Medium - Hit-or-miss by property',
  '5. **Atlantic City** - Low - Rare unless you catch a fresh install',
]

/** Aristocrat-heavy national footprint (Phoenix Link / Buffalo Ascension guides on test). */
export const WTF_REGIONS_ARISTOCRAT_HEAVY = [
  '1. **Oklahoma tribal** - Medium-High - **Cherokee Nation**',
  '2. **California tribal** - Medium - Hit-or-miss by property',
  '3. **Pennsylvania / Midwest commercial** - Medium-High - **Parx**, **Rivers**, **Wind Creek**',
  '4. **Florida tribal** - Medium-High - **Seminole Hard Rock Tampa**, **Hollywood**',
  '5. **Atlantic City** - Medium - **Borgata**, **Resorts**, **Golden Nugget**',
]

/** L&W-heavy national footprint (Phoenix Link guide on test). */
export const WTF_REGIONS_LNW_HEAVY = [
  '1. **Atlantic City** - Medium-High - **Borgata**, **Resorts**, **Golden Nugget**',
  '2. **Pennsylvania / Midwest commercial** - Medium-High - **Parx**, **Rivers**, **Wind Creek**',
  '3. **Florida tribal** - Medium-High - **Seminole Hard Rock Tampa**, **Hollywood**',
  '4. **Oklahoma tribal** - Medium - **Cherokee Nation**',
  '5. **Mississippi Gulf Coast** - Medium - Biloxi, Gulfport',
]

/** Ainsworth tribal/commercial (Ainsworth MHB + Coin Kingdom Aztec guides on test). */
export const WTF_REGIONS_AINSWORTH_COMMON = [
  '1. **Oklahoma tribal** - High - Hit-or-miss by property',
  '2. **California tribal** - Medium-High - Hit-or-miss by property',
  '3. **Florida tribal** - Medium - **Seminole Hard Rock Tampa**, **Hollywood**',
  '4. **Pennsylvania / Midwest commercial** - Medium - Hit-or-miss by property',
  '5. **Atlantic City** - Medium - Hit-or-miss by property',
]

/** AGS (AGS Must Hit By guide on test). */
export const WTF_REGIONS_AGS = [
  '1. **Florida tribal** - Medium-High - **Seminole Hard Rock Tampa**, **Hollywood**',
  '2. **Oklahoma tribal** - Medium - Hit-or-miss by property',
  '3. **Pennsylvania / Midwest commercial** - Medium - Hit-or-miss by property',
  '4. **California tribal** - Medium - Hit-or-miss by property',
  '5. **Atlantic City** - Low-Medium - Hit-or-miss by property',
]

/**
 * @param {string} title
 * @param {string | { vegas?: string, regions?: string[] } | null} [vegasOrOpts]
 * @returns {string}
 */
export function wtf(title, vegasOrOpts = null) {
  /** @type {string | undefined} */
  let vegas
  /** @type {string[] | undefined} */
  let regions

  if (typeof vegasOrOpts === 'string') {
    vegas = vegasOrOpts
  } else if (vegasOrOpts && typeof vegasOrOpts === 'object') {
    vegas = vegasOrOpts.vegas
    regions = vegasOrOpts.regions
  }

  const vegasBlock = vegas ?? WTF_VEGAS_DEFAULT
  const regionLines = regions ?? WTF_REGIONS_DEFAULT

  return `### Where to Find ${title}

**In Las Vegas / physical casinos:**
${vegasBlock}

**Online / free play:**
- Demos may exist; persistent state will not match live floors.

---

### Top cities / regions (outside Las Vegas)

${regionLines.join('\n')}`
}
