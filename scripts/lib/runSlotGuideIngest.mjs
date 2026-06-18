import { createClient } from "@supabase/supabase-js";
import {
  buildCardMeta,
  buildGuideMarkdown,
  validateIngestPayload,
} from "./slotGuideIngestCore.mjs";
import {
  createSupabaseServiceClient,
  loadSupabaseEnv,
  readSupabaseCredentials,
} from "./supabaseEnv.mjs";
import { canWriteRepo, toWebpBuffer, writeSlotGuideToRepo } from "./slotGuideRepoWrite.mjs";
import {
  uploadGuideAsset,
  upsertSlotGuideFromManifest,
  fetchExistingGuideThumbnailUrls,
} from "./slotGuideSupabaseUpsert.mjs";

const CF_R2_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Upload a guide image to Cloudflare R2 via the guide-cf-r2-upload Edge function.
 * Uses service-role bearer auth (server-to-server).
 * Returns the public URL, or null if R2 is not configured (503 → caller falls back to Supabase Storage).
 *
 * @param {{ supabaseUrl: string, serviceRoleKey: string, slug: string, filename: string, buffer: Buffer, contentType?: string }} opts
 * @returns {Promise<string | null>}
 */
async function uploadGuideAssetToR2({ supabaseUrl, serviceRoleKey, slug, filename, buffer, contentType = "image/webp" }) {
  const edgeFnUrl = `${supabaseUrl}/functions/v1/guide-cf-r2-upload`;
  let mintRes;
  try {
    mintRes = await fetch(edgeFnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ slug, contentType, filename }),
    });
  } catch (err) {
    console.warn(`[guide-cf-r2-upload] Network error — falling back to Supabase Storage: ${err.message}`);
    return null;
  }

  if (mintRes.status === 503) {
    // R2 not configured on this project — silently fall back
    return null;
  }
  if (!mintRes.ok) {
    const body = await mintRes.json().catch(() => ({}));
    throw new Error(`guide-cf-r2-upload (${mintRes.status}): ${body.error || mintRes.statusText}`);
  }

  const { uploadURL, publicUrl } = await mintRes.json();
  if (!uploadURL || !publicUrl) throw new Error("guide-cf-r2-upload: missing uploadURL or publicUrl in response.");

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Cache-Control": CF_R2_CACHE_CONTROL },
    body: buffer,
  });
  if (!putRes.ok) {
    throw new Error(`R2 PUT failed (${putRes.status}) for ${filename}`);
  }

  return publicUrl;
}

/**
 * @param {string | null | undefined} raw
 * @returns {Buffer | null}
 */
function decodeBase64Image(raw) {
  if (!raw || typeof raw !== "string") return null;
  const stripped = raw.replace(/^data:[^;]+;base64,/, "").trim();
  if (!stripped) return null;
  return Buffer.from(stripped, "base64");
}

/**
 * @param {{
 *   payload: unknown,
 *   heroImage?: { dataBase64?: string } | null,
 *   diagramImages?: Array<{ filename: string, dataBase64?: string }>,
 *   target?: "test" | "production" | null,
 *   writeRepo?: boolean,
 *   syncSupabase?: boolean,
 * }} options
 */
export async function runSlotGuideIngest({
  payload,
  heroImage,
  diagramImages = [],
  target = "test",
  writeRepo,
  syncSupabase = true,
}) {
  const validated = validateIngestPayload(payload);
  if (!validated.ok) {
    return { ok: false, status: 400, errors: validated.errors };
  }

  const p = validated.value;
  /** @type {Record<string, unknown>} */
  const machine = /** @type {Record<string, unknown>} */ (p.machine);
  const slug = String(machine.slug);

  const heroBuf = decodeBase64Image(heroImage?.dataBase64);
  const hasHero = Boolean(heroBuf?.length);

  const diagramBuffers = [];
  for (const d of diagramImages) {
    const buf = decodeBase64Image(d.dataBase64);
    if (buf?.length) diagramBuffers.push({ filename: d.filename, buffer: buf });
  }

  const heroWebp = hasHero ? await toWebpBuffer(heroBuf) : null;
  const diagramsWebp = [];
  for (const d of diagramBuffers) {
    diagramsWebp.push({ filename: d.filename, buffer: await toWebpBuffer(d.buffer) });
  }

  const shouldWriteRepo = writeRepo ?? canWriteRepo();
  const repoGuideMarkdown = buildGuideMarkdown(p);
  const cardMeta = buildCardMeta(p);
  cardMeta.machine = {
    .../** @type {Record<string, unknown>} */ (cardMeta.machine),
    thumbnail_url: hasHero ? `/guides/${slug}/hero.webp` : null,
  };

  /** @type {Record<string, unknown>} */
  const result = {
    slug,
    target,
    wroteRepo: false,
    syncedSupabase: false,
    storageUrls: {},
    repoPaths: null,
  };

  if (shouldWriteRepo) {
    const repo = await writeSlotGuideToRepo({
      slug,
      cardMeta,
      guideMarkdown: repoGuideMarkdown,
      hero: heroWebp,
      diagrams: diagramsWebp,
    });
    result.wroteRepo = true;
    result.repoPaths = repo.files;
  }

  if (syncSupabase) {
    loadSupabaseEnv(target);
    const supabase = createSupabaseServiceClient(createClient);
    const { url, key: serviceRoleKey } = readSupabaseCredentials();
    const supabaseUrl = url;

    const existingThumbs = hasHero
      ? { guide: null, machine: null, resolved: null }
      : await fetchExistingGuideThumbnailUrls(supabase, slug);

    let heroPublicUrl = null;
    if (heroWebp) {
      heroPublicUrl = await uploadGuideAssetToR2({
        supabaseUrl, serviceRoleKey, slug,
        filename: "hero.webp", buffer: heroWebp, contentType: "image/webp",
      });
      if (!heroPublicUrl) {
        heroPublicUrl = await uploadGuideAsset(supabase, { slug, filename: "hero.webp", buffer: heroWebp });
      }
      result.storageUrls.hero = heroPublicUrl;
    }

    for (const d of diagramsWebp) {
      let publicUrl = await uploadGuideAssetToR2({
        supabaseUrl, serviceRoleKey, slug,
        filename: d.filename, buffer: d.buffer, contentType: "image/webp",
      });
      if (!publicUrl) {
        publicUrl = await uploadGuideAsset(supabase, { slug, filename: d.filename, buffer: d.buffer });
      }
      result.storageUrls[d.filename] = publicUrl;
    }

    /** @type {Record<string, string>} */
    const storageUrlByFile = { ...result.storageUrls };
    if (heroPublicUrl) storageUrlByFile["hero.webp"] = heroPublicUrl;
    const supabaseGuideMarkdown = buildGuideMarkdown(p, {
      resolveImageUrl: (filename) => storageUrlByFile[filename],
    });

    const supabaseMeta = buildCardMeta(p);
    const preservedThumb = existingThumbs.resolved ?? null;
    supabaseMeta.machine = {
      .../** @type {Record<string, unknown>} */ (supabaseMeta.machine),
      thumbnail_url: heroPublicUrl ?? preservedThumb,
    };
    if (preservedThumb && !heroPublicUrl) {
      /** @type {Record<string, unknown>} */ (supabaseMeta.guide_seed).thumbnail_url = preservedThumb;
    }

    await upsertSlotGuideFromManifest(supabase, {
      json: supabaseMeta,
      content_markdown: supabaseGuideMarkdown,
    });
    result.syncedSupabase = true;
    result.supabaseHost = url ? new URL(url).hostname : null;
    result.files = {
      cardMetaJson: JSON.stringify(shouldWriteRepo ? cardMeta : supabaseMeta, null, 2),
      guideMarkdown: shouldWriteRepo ? repoGuideMarkdown : supabaseGuideMarkdown,
    };
  } else {
    result.files = {
      cardMetaJson: JSON.stringify(cardMeta, null, 2),
      guideMarkdown: repoGuideMarkdown,
    };
  }

  return { ok: true, status: 200, result };
}

