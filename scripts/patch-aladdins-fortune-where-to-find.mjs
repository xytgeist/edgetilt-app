/**
 * Patch aladdins-fortune Where to find on test DB.
 * Usage: node scripts/patch-aladdins-fortune-where-to-find.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, readSupabaseCredentials } from "./lib/supabaseEnv.mjs";

const SLUG = "aladdins-fortune";

const WHERE_BODY = `### Where to Find Aladdin's Fortune

**In Las Vegas / physical casinos:**
- **IGT TRUE 3D** cabinet ... tall, easy to spot. Usually grouped in **banks** with other IGT 3D-era titles (Sphinx 3D, Plants vs. Zombies, Dreams of Asia, Golden Jungle-style clones).
- **Rare on today's floor** vs its 2016 launch peak. Many properties have **pulled or swapped** these cabinets over the years ... do not assume a casino that had it last trip still has it.
- Historically reported on Las Vegas floors including **Paris Las Vegas**, **Cosmopolitan**, and **Longhorn** (Boulder Highway locals). Strip and locals both worth a quick scan when you are already in the building.
- This game is **well known to APs** in Vegas. Expect competition ... a heated machine rarely sits long. It only takes a few seconds to check the W-I-L-D meters, so treat it as a **walk-by hunt**, not a destination trip by itself.

**Online / free play:**
- Demo and review footage exists for **mechanics preview**. Persistent letter state and bet-level behavior will **not** match live floor machines ... use for rules only.

---

### Top cities / regions (outside Las Vegas)

1. **Southern California** - Medium - **San Manuel** and other tribal floors have carried the title; common hunting ground for SoCal APs who also hit Vegas
2. **Ohio (JACK properties)** - Low-Medium - Recent floor presence at **JACK Cleveland** and related JACK installs ... verify live, not every JACK has the bank
3. **Michigan tribal** - Low - Upper Peninsula / tribal properties (e.g. **Kewadin**) have listed it in machine mixes; scattered elsewhere in the state
4. **Pennsylvania / Atlantic City** - Low - IGT 3D-era banks still exist, but **Aladdin's Fortune** specifically is hit-or-miss vs Golden Jungle and other persistent clones
5. **Nevada (Reno / Lake Tahoe)** - Low-Medium - Regional properties and **Cal Neva**-area floors historically ran IGT 3D banks; thinner than Vegas
6. **Florida / East Coast commercial** - Low - Occasional legacy installs; not a primary national hunt market for this title

**Summary:**
- Treat **Aladdin's Fortune** as a **legacy rare** title ... strong AP game, **shrinking footprint** nationally.
- **Vegas + Southern California** are the most realistic starting points for a dedicated hunt.
- Confirm the exact title on the glass ... **Golden Jungle** is the common clone with the same Wild Stays mechanic.`;

const SKINS_MARKER = "## 🎭 Skins";
const WHERE_SECTION = `## 📍 Where to find\n\n${WHERE_BODY}\n\n`;

loadSupabaseEnv("test");
const { url, key } = readSupabaseCredentials();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("guides")
  .select("id, slug, content_markdown")
  .eq("slug", SLUG)
  .maybeSingle();

if (error) throw new Error(error.message);
if (!data) throw new Error(`${SLUG} not found on test`);

let md = data.content_markdown || "";

const whereRe =
  /## 📍 Where to find[\s\S]*?(?=\n## 🎭 Skins|\n---\n\n## 🎰 Gameplay|\n## 🎰 Gameplay|$)/;
if (/## 📍 Where to find/i.test(md)) {
  md = md.replace(whereRe, WHERE_SECTION.trimEnd() + "\n\n");
} else if (!md.includes(SKINS_MARKER)) {
  throw new Error("Expected Skins section marker not found — aborting");
} else {
  md = md.replace(SKINS_MARKER, WHERE_SECTION + SKINS_MARKER);
}

const nowIso = new Date().toISOString();
const { error: upErr } = await sb
  .from("guides")
  .update({ content_markdown: md, updated_at: nowIso })
  .eq("id", data.id);

if (upErr) throw new Error(upErr.message);
console.log(`Updated ${SLUG} Where to find on test (${md.length} chars).`);
