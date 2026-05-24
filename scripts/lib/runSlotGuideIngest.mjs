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
} from "./slotGuideSupabaseUpsert.mjs";

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
  if (!heroBuf?.length) {
    return { ok: false, status: 400, errors: ["heroImage is required (base64)."] };
  }

  const diagramBuffers = [];
  for (const d of diagramImages) {
    const buf = decodeBase64Image(d.dataBase64);
    if (buf?.length) diagramBuffers.push({ filename: d.filename, buffer: buf });
  }

  const heroWebp = await toWebpBuffer(heroBuf);
  const diagramsWebp = [];
  for (const d of diagramBuffers) {
    diagramsWebp.push({ filename: d.filename, buffer: await toWebpBuffer(d.buffer) });
  }

  const shouldWriteRepo = writeRepo ?? canWriteRepo();
  const repoGuideMarkdown = buildGuideMarkdown(p);
  const cardMeta = buildCardMeta(p);
  cardMeta.machine = {
    .../** @type {Record<string, unknown>} */ (cardMeta.machine),
    thumbnail_url: `/guides/${slug}/hero.webp`,
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
    const { url } = readSupabaseCredentials();

    const heroPublicUrl = await uploadGuideAsset(supabase, {
      slug,
      filename: "hero.webp",
      buffer: heroWebp,
    });
    result.storageUrls.hero = heroPublicUrl;

    for (const d of diagramsWebp) {
      const publicUrl = await uploadGuideAsset(supabase, {
        slug,
        filename: d.filename,
        buffer: d.buffer,
      });
      result.storageUrls[d.filename] = publicUrl;
    }

    /** @type {Record<string, string>} */
    const storageUrlByFile = { "hero.webp": heroPublicUrl, ...result.storageUrls };
    const supabaseGuideMarkdown = buildGuideMarkdown(p, {
      resolveImageUrl: (filename) => storageUrlByFile[filename],
    });

    const supabaseMeta = buildCardMeta(p);
    supabaseMeta.machine = {
      .../** @type {Record<string, unknown>} */ (supabaseMeta.machine),
      thumbnail_url: heroPublicUrl,
    };

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

export function checkIngestSecret(req) {
  const expected = process.env.GUIDE_INGEST_SECRET?.trim();
  if (!expected) return { ok: false, status: 503, error: "GUIDE_INGEST_SECRET is not configured on the server." };
  const got =
    req.headers?.["x-guide-ingest-secret"] ||
    req.headers?.["X-Guide-Ingest-Secret"] ||
    req.headers?.get?.("x-guide-ingest-secret");
  if (!got || String(got).trim() !== expected) {
    return { ok: false, status: 401, error: "Invalid or missing x-guide-ingest-secret header." };
  }
  return { ok: true };
}
