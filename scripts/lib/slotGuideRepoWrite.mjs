import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import sharp from "sharp";
import { repoRoot } from "./supabaseEnv.mjs";

/**
 * @param {Buffer} input
 * @returns {Promise<Buffer>}
 */
export async function toWebpBuffer(input) {
  return sharp(input).webp({ quality: 85 }).toBuffer();
}

/**
 * @param {{
 *   slug: string,
 *   cardMeta: Record<string, unknown>,
 *   guideMarkdown: string,
 *   hero?: Buffer | null,
 *   diagrams?: Array<{ filename: string, buffer: Buffer }>,
 * }} args
 */
export async function writeSlotGuideToRepo({ slug, cardMeta, guideMarkdown, hero, diagrams = [] }) {
  const slotDir = path.join(repoRoot, "Slots", slug);
  const assetDir = path.join(repoRoot, "public", "guides", slug);
  await fsp.mkdir(slotDir, { recursive: true });
  await fsp.mkdir(assetDir, { recursive: true });

  if (hero?.length) {
    const heroBuf = await toWebpBuffer(hero);
    await fsp.writeFile(path.join(assetDir, "hero.webp"), heroBuf);
  }

  for (const d of diagrams) {
    if (!d.buffer?.length) continue;
    const buf = await toWebpBuffer(d.buffer);
    await fsp.writeFile(path.join(assetDir, d.filename), buf);
  }

  await fsp.writeFile(
    path.join(slotDir, "card.meta.json"),
    `${JSON.stringify(cardMeta, null, 2)}\n`,
    "utf8"
  );
  await fsp.writeFile(path.join(slotDir, "guide.md"), guideMarkdown, "utf8");

  return {
    slotDir,
    assetDir,
    files: {
      cardMeta: path.join(slotDir, "card.meta.json"),
      guideMd: path.join(slotDir, "guide.md"),
      hero: hero?.length ? path.join(assetDir, "hero.webp") : null,
      diagrams: diagrams.map((d) => path.join(assetDir, d.filename)),
    },
  };
}

export function canWriteRepo() {
  if (process.env.SLOT_GUIDE_WRITE_REPO === "1" || process.env.SLOT_GUIDE_WRITE_REPO === "true") {
    return true;
  }
  if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV !== "production";
}
