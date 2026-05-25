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
 * Auth: Authorization: Bearer <supabase-session-token> header.
 *   Token is validated against the test Supabase project; caller must have
 *   profiles.role = 'admin'. No separate ingest secret needed.
 *
 * Supabase: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on Vercel (per environment).
 * Local dev with repo writes: SLOT_GUIDE_WRITE_REPO=1 and run via `npm run slot-guide:serve`.
 */

import { createClient } from "@supabase/supabase-js";
import { runSlotGuideIngest } from "../scripts/lib/runSlotGuideIngest.mjs";

// Publishable — safe to hardcode. Admin accounts live on test.
const AUTH_SB_URL  = "https://jtjgtucumuoswnbauxry.supabase.co";
const AUTH_SB_ANON = "sb_publishable_u3-GQGrZ_hswapkiWiPyLA_Ah3mxU8B";

async function checkAdminJwt(req) {
  const authHeader =
    req.headers?.["authorization"] ||
    req.headers?.["Authorization"] ||
    req.headers?.get?.("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Authorization: Bearer <token> header required." };
  }
  const token = authHeader.slice(7).trim();

  // Validate the token and get the user
  const sb = createClient(AUTH_SB_URL, AUTH_SB_ANON);
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    return { ok: false, status: 401, error: "Invalid or expired session token." };
  }

  // Confirm admin role
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, status: 403, error: "Admin role required." };
  }

  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const auth = await checkAdminJwt(req);
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
