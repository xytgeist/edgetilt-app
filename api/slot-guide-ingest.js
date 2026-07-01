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
 *   Token is validated against the Supabase project for `body.target`; caller must have
 *   profiles.role = 'admin' on that project. No separate ingest secret needed.
 *
 * Supabase: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on Vercel (test ingest), or
 *   SUPABASE_URL_PRODUCTION + SUPABASE_SERVICE_ROLE_KEY_PRODUCTION when target=production.
 *   JWT validation uses matching URL + anon key (VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY_*).
 *   (No .env.supabase.* file on Vercel — uses process.env only.)
 * Local dev with repo writes: SLOT_GUIDE_WRITE_REPO=1 and run via `npm run slot-guide:serve`.
 */

import { createClient } from "@supabase/supabase-js";
import { runSlotGuideIngest } from "../scripts/lib/runSlotGuideIngest.mjs";

function resolveAuthSupabase(target) {
  const isProd = target === "production";
  const urlRaw = isProd
    ? process.env.SUPABASE_URL_PRODUCTION || process.env.VITE_SUPABASE_URL
    : process.env.SUPABASE_URL_TEST || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const url = String(urlRaw || "").trim().replace(/\/+$/, "");
  const anon = String(
    isProd
      ? process.env.SUPABASE_ANON_KEY_PRODUCTION || process.env.VITE_SUPABASE_ANON_KEY
      : process.env.SUPABASE_ANON_KEY_TEST || process.env.VITE_SUPABASE_ANON_KEY
  ).trim();
  if (!url || !anon) {
    return {
      ok: false,
      status: 500,
      error: `Ingest auth misconfigured for target=${target}. Set Supabase URL + anon key env vars on this deployment.`,
    };
  }
  return { ok: true, url, anon };
}

async function checkAdminJwt(req, target) {
  const authHeader =
    req.headers?.["authorization"] ||
    req.headers?.["Authorization"] ||
    req.headers?.get?.("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Authorization: Bearer <token> header required." };
  }
  const token = authHeader.slice(7).trim();

  const resolved = resolveAuthSupabase(target);
  if (!resolved.ok) return resolved;

  const sb = createClient(resolved.url, resolved.anon);
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

  const auth = await checkAdminJwt(req, target);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
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
