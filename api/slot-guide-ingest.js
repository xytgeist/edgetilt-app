/**
 * Vercel Serverless: ingest AP Guide slot card + markdown + images.
 *
 * POST JSON body:
 * {
 *   "target": "test" | "production",
 *   "payload": { machine, guide, diagrams[] },
 *   "heroImage": { "dataBase64": "..." },
 *   "diagramImages": [{ "filename": "foo.webp", "dataBase64": "..." }]
 * }
 *
 * Auth: header `x-guide-ingest-secret` must match env `GUIDE_INGEST_SECRET`.
 * Supabase: uses `.env.supabase.test` / `.env.supabase.production` via --target (loaded at runtime from repo env on Vercel).
 *
 * On Vercel, set GUIDE_INGEST_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (per environment).
 * Local dev with repo writes: SLOT_GUIDE_WRITE_REPO=1 and run via `npm run slot-guide:serve`.
 */

import { checkIngestSecret, runSlotGuideIngest } from "../scripts/lib/runSlotGuideIngest.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-guide-ingest-secret");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const auth = checkIngestSecret(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "Invalid JSON body." });
      return;
    }
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "JSON body required." });
    return;
  }

  const targetRaw = String(body.target ?? "test").trim().toLowerCase();
  const target = targetRaw === "production" || targetRaw === "prod" ? "production" : "test";
  const writeRepo = body.writeRepo === true;

  try {
    const out = await runSlotGuideIngest({
      payload: body.payload,
      heroImage: body.heroImage,
      diagramImages: Array.isArray(body.diagramImages) ? body.diagramImages : [],
      target,
      writeRepo,
      syncSupabase: body.syncSupabase !== false,
    });
    if (!out.ok) {
      res.status(out.status).json({ errors: out.errors });
      return;
    }
    res.status(200).json(out.result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};
