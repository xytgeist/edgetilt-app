const NERF_LEVELS = new Set(["Low", "Medium", "High"]);

/** @returns {null | "Low" | "Medium" | "High"} */
function parseNerfRiskOverride(raw, slug) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  if (s.toLowerCase() === "auto") return null;
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (NERF_LEVELS.has(cap)) return /** @type {"Low"|"Medium"|"High"} */ (cap);
  throw new Error(
    `Invalid machine.nerf_risk "${raw}" for slug "${slug}". Use Low, Medium, High, "auto", or omit.`
  );
}

function nerfRiskFromGuideAdded(addedIso, now = new Date()) {
  if (!addedIso) return "Medium";
  const t0 = new Date(addedIso).getTime();
  if (Number.isNaN(t0)) return "Medium";
  const days = (now.getTime() - t0) / 86400000;
  if (days < 0) return "High";
  if (days < 180) return "High";
  if (days < 365) return "Medium";
  return "Low";
}

function resolveNerfRiskForSync({ slug, manifestNerfRisk, guideCreatedAt, now }) {
  const override = parseNerfRiskOverride(manifestNerfRisk, slug);
  if (override) return override;
  const anchor = guideCreatedAt ?? now.toISOString();
  return nerfRiskFromGuideAdded(anchor, now);
}

export async function fetchGuideCreatedAt(supabase, guideSlug) {
  const { data, error } = await supabase
    .from("guides")
    .select("created_at")
    .eq("slug", guideSlug)
    .maybeSingle();
  if (error) throw new Error(`guides.created_at lookup (${guideSlug}): ${error.message}`);
  return data?.created_at ?? null;
}

/**
 * Upsert machines + guides from manifest-shaped data.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ json: Record<string, unknown>, content_markdown: string }} manifest
 */
export async function upsertSlotGuideFromManifest(supabase, { json, content_markdown }) {
  /** @type {Record<string, unknown>} */
  const machine = /** @type {Record<string, unknown>} */ (json.machine);
  /** @type {Record<string, unknown>} */
  const guideSeed = /** @type {Record<string, unknown>} */ (json.guide_seed);
  const slug = String(machine.slug);

  const guideCreatedAt = await fetchGuideCreatedAt(supabase, String(guideSeed.slug));
  const now = new Date();
  const nerfResolved = resolveNerfRiskForSync({
    slug,
    manifestNerfRisk: machine.nerf_risk,
    guideCreatedAt,
    now,
  });

  const machinePayload = {
    slug,
    name: machine.name,
    manufacturer: machine.manufacturer,
    type: machine.type,
    difficulty: machine.difficulty,
    vegas_availability: machine.vegas_availability,
    nerf_risk: nerfResolved,
    has_calculator: machine.has_calculator,
    calculator_slug: machine.calculator_slug,
    thumbnail_url: machine.thumbnail_url ?? null,
  };
  if (machine.volatility_index != null) machinePayload.volatility_index = machine.volatility_index;
  if (machine.popularity_summary != null) machinePayload.popularity_summary = machine.popularity_summary;
  if (machine.release_year != null) machinePayload.release_year = machine.release_year;

  const { data: upserted, error: me } = await supabase
    .from("machines")
    .upsert(machinePayload, { onConflict: "slug" })
    .select("id")
    .single();
  if (me) throw new Error(`machines upsert ${slug}: ${me.message}`);

  const evLineRaw = guideSeed.card_ev_threshold ?? guideSeed.card_gist;
  const guidePayload = {
    machine_id: upserted.id,
    slug: guideSeed.slug,
    title: guideSeed.title,
    content_markdown,
    card_ev_threshold:
      typeof evLineRaw === "string" && String(evLineRaw).trim() !== ""
        ? String(evLineRaw).trim()
        : null,
    published: guideSeed.published !== false,
    difficulty: machine.difficulty ?? null,
    thumbnail_url: guideSeed.thumbnail_url ?? machine.thumbnail_url ?? null,
    diagram_urls: guideSeed.diagram_urls ?? null,
    related_machine_slugs: guideSeed.related_machine_slugs ?? null,
  };

  const { error: ge } = await supabase.from("guides").upsert(guidePayload, { onConflict: "slug" });
  if (ge) throw new Error(`guides upsert ${slug}: ${ge.message}`);

  return { slug, machineId: upserted.id };
}

const GUIDE_ASSETS_BUCKET = "guide-assets";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ slug: string, filename: string, buffer: Buffer, contentType?: string }} args
 */
export async function uploadGuideAsset(supabase, { slug, filename, buffer, contentType = "image/webp" }) {
  const objectPath = `${slug}/${filename}`;
  const { error } = await supabase.storage.from(GUIDE_ASSETS_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: true,
    cacheControl: "public, max-age=31536000, immutable",
  });
  if (error) throw new Error(`storage upload ${objectPath}: ${error.message}`);

  const { data } = supabase.storage.from(GUIDE_ASSETS_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export { GUIDE_ASSETS_BUCKET };
