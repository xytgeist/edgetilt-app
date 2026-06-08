/** @typedef {"when_to_play" | "when_to_stop" | "how_to_check" | "risk" | "skins" | "gameplay"} DiagramPlacement */

export const SLUG_RE = /^[a-z0-9-]+$/;

const DIFFICULTIES = new Set(["Beginner", "Intermediate", "Advanced"]);
const NERF_LEVELS = new Set(["Low", "Medium", "High", "auto"]);
const PLACEMENTS = new Set([
  "when_to_play",
  "when_to_stop",
  "how_to_check",
  "risk",
  "skins",
  "gameplay",
]);

/**
 * @param {string} raw
 * @returns {string}
 */
export function slugify(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * @param {string} name
 * @param {string} slug
 */
export function diagramFilename(name, slug) {
  const base = slugify(name.replace(/\.[^.]+$/, "")) || `${slug}-diagram`;
  return base.endsWith(".webp") ? base : `${base}.webp`;
}

/**
 * @param {string} slug
 * @param {string} filename
 */
export function guidePublicPath(slug, filename) {
  return `/guides/${slug}/${filename}`;
}

/**
 * @param {string} text
 */
function mdBlock(text) {
  const t = String(text ?? "").trim();
  return t ? `${t}\n\n` : "";
}

/**
 * @param {string} slug
 * @param {string} alt
 * @param {string} filename
 * @param {(filename: string) => string | undefined} [resolveUrl]
 */
export function markdownImageLine(slug, alt, filename, resolveUrl) {
  const path = resolveUrl?.(filename) || guidePublicPath(slug, filename);
  return `![${alt}](${path})\n\n`;
}

/**
 * @param {Array<{ alt: string, filename: string, placement: DiagramPlacement }>} diagrams
 * @param {DiagramPlacement} placement
 * @param {string} slug
 */
function diagramsForPlacement(diagrams, placement, slug, resolveUrl) {
  return diagrams
    .filter((d) => d.placement === placement)
    .map((d) => markdownImageLine(slug, d.alt, d.filename, resolveUrl))
    .join("");
}

/**
 * @param {{
 *   machine: Record<string, unknown>,
 *   guide: Record<string, unknown>,
 *   diagrams?: Array<{ alt: string, filename: string, placement: DiagramPlacement }>,
 * }} payload
 * @param {{ resolveImageUrl?: (filename: string) => string | undefined }} [opts]
 */
export function buildGuideMarkdown(payload, opts = {}) {
  const resolveUrl = opts.resolveImageUrl;
  const { machine, guide } = payload;
  const slug = String(machine.slug);
  const diagrams = Array.isArray(payload.diagrams) ? payload.diagrams : [];
  const title = String(guide.title || machine.name || slug).trim();
  const riskBullets = Array.isArray(guide.risk_bullets)
    ? guide.risk_bullets.map((b) => String(b).trim()).filter(Boolean)
    : [];

  let md = `# ${title}\n\n`;
  md += `## 🟢 When to play\n\n${mdBlock(guide.when_to_play)}`;
  md += diagramsForPlacement(diagrams, "when_to_play", slug, resolveUrl);
  md += `## 🛑 When to stop\n\n${mdBlock(guide.when_to_stop)}`;
  md += diagramsForPlacement(diagrams, "when_to_stop", slug, resolveUrl);
  md += `## 🔍 How to check (quick/easy)\n\n${mdBlock(guide.how_to_check)}`;
  md += diagramsForPlacement(diagrams, "how_to_check", slug, resolveUrl);

  md += `## ⚠️ Risk & Warnings\n\n`;
  if (guide.risk_bankroll) {
    md += `**Bankroll on hand: ${String(guide.risk_bankroll).trim()}**\n\n`;
  }
  md += mdBlock(guide.risk_summary);
  if (riskBullets.length) {
    md += `${riskBullets.map((b) => `- ${b}`).join("\n")}\n\n`;
  }
  md += diagramsForPlacement(diagrams, "risk", slug, resolveUrl);

  const skins = String(guide.skins_markdown ?? "").trim();
  if (skins) {
    md += `## 🎭 Skins (same game different theme/art)\n\n${skins}\n\n`;
    md += diagramsForPlacement(diagrams, "skins", slug, resolveUrl);
  }

  md += `---\n\n## 🎰 Gameplay Mechanics\n\n${mdBlock(guide.gameplay_mechanics)}`;
  md += diagramsForPlacement(diagrams, "gameplay", slug, resolveUrl);

  return md.trimEnd() + "\n";
}

/**
 * @param {{
 *   machine: Record<string, unknown>,
 *   guide: Record<string, unknown>,
 *   diagrams?: Array<{ filename: string }>,
 *   ap?: Record<string, unknown> | null,
 * }} payload
 */
export function buildCardMeta(payload) {
  const m = payload.machine;
  const g = payload.guide;
  const slug = String(m.slug);
  const diagrams = Array.isArray(payload.diagrams) ? payload.diagrams : [];

  return {
    schema_version: 1,
    source: "LVSlotPro slot guide form ingest",
    machine: {
      slug,
      name: m.name,
      manufacturer: m.manufacturer,
      type: m.type,
      difficulty: m.difficulty,
      popularity: m.popularity ?? m.vegas_availability,
      nerf_risk: m.nerf_risk ?? "auto",
      has_calculator: Boolean(m.has_calculator),
      calculator_slug: m.has_calculator ? m.calculator_slug ?? slug : null,
      volatility_index: m.volatility_index ?? null,
      popularity_summary: m.popularity_summary ?? null,
      release_year: m.release_year ?? null,
      thumbnail_url: m.thumbnail_url ?? null,
    },
    guide_seed: {
      slug,
      title: g.title || m.name,
      published: g.published !== false,
      card_summary_bullets: Array.isArray(g.card_summary_bullets) ? g.card_summary_bullets : [],
      content_markdown_file: "guide.md",
      last_updated: new Date().toISOString().slice(0, 10),
      card_ev_threshold: g.card_ev_threshold ?? null,
    },
    ap: payload.ap ?? null,
    assets: {
      hero_relative: "hero.webp",
      thumbnails_relative: [],
      diagrams_relative: diagrams.map((d) => d.filename).filter(Boolean),
      legacy_slots_subfolder: null,
    },
  };
}

/**
 * @param {unknown} payload
 * @returns {{ ok: true, value: Record<string, unknown> } | { ok: false, errors: string[] }}
 */
export function validateIngestPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["Payload must be an object."] };
  }
  /** @type {Record<string, unknown>} */
  const p = /** @type {Record<string, unknown>} */ (payload);
  const machine = p.machine;
  const guide = p.guide;
  if (!machine || typeof machine !== "object") errors.push("machine is required.");
  if (!guide || typeof guide !== "object") errors.push("guide is required.");

  if (machine && typeof machine === "object") {
    /** @type {Record<string, unknown>} */
    const m = /** @type {Record<string, unknown>} */ (machine);
    const slug = String(m.slug ?? "").trim();
    if (!SLUG_RE.test(slug)) errors.push("machine.slug must be lowercase kebab-case.");
    for (const field of ["name", "manufacturer", "type", "popularity"]) {
      const val =
        field === "popularity"
          ? String(m.popularity ?? m.vegas_availability ?? "").trim()
          : String(m[field] ?? "").trim();
      if (!val) errors.push(`machine.${field} is required.`);
    }
    if (!DIFFICULTIES.has(String(m.difficulty))) {
      errors.push("machine.difficulty must be Beginner, Intermediate, or Advanced.");
    }
    const nerf = String(m.nerf_risk ?? "auto");
    if (!NERF_LEVELS.has(nerf)) errors.push('machine.nerf_risk must be Low, Medium, High, or "auto".');
    if (m.has_calculator && !String(m.calculator_slug ?? m.slug ?? "").trim()) {
      errors.push("machine.calculator_slug is required when has_calculator is true.");
    }
  }

  if (guide && typeof guide === "object") {
    /** @type {Record<string, unknown>} */
    const g = /** @type {Record<string, unknown>} */ (guide);
    // Guide body sections and card_ev_threshold may be empty at ingest (fill via draft / later edit).
  }

  const diagrams = Array.isArray(p.diagrams) ? p.diagrams : [];
  for (const [i, d] of diagrams.entries()) {
    if (!d || typeof d !== "object") {
      errors.push(`diagrams[${i}] must be an object.`);
      continue;
    }
    if (!String(d.alt ?? "").trim()) errors.push(`diagrams[${i}].alt is required.`);
    if (!String(d.filename ?? "").trim()) errors.push(`diagrams[${i}].filename is required.`);
    if (!PLACEMENTS.has(String(d.placement))) {
      errors.push(`diagrams[${i}].placement must be one of: ${[...PLACEMENTS].join(", ")}.`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: p };
}
