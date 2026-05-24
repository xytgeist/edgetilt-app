/**
 * Local ingest server — writes to repo (public/guides + Slots) and upserts Supabase.
 * Run: npm run slot-guide:serve
 * Form: npm run dev → /slot-guide-form.html (set API URL to http://localhost:8787/ingest)
 */

import http from "node:http";
import { checkIngestSecret, runSlotGuideIngest } from "./lib/runSlotGuideIngest.mjs";

const PORT = Number(process.env.SLOT_GUIDE_INGEST_PORT || 8787);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-guide-ingest-secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/ingest") {
    res.writeHead(req.method === "GET" && req.url === "/health" ? 200 : 404, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(req.url === "/health" ? { ok: true } : { error: "Not found" }));
    return;
  }

  const auth = checkIngestSecret(req);
  if (!auth.ok) {
    res.writeHead(auth.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw);
    const targetRaw = String(body.target ?? "test").trim().toLowerCase();
    const target = targetRaw === "production" || targetRaw === "prod" ? "production" : "test";

    process.env.SLOT_GUIDE_WRITE_REPO = "1";
    const out = await runSlotGuideIngest({
      payload: body.payload,
      heroImage: body.heroImage,
      diagramImages: Array.isArray(body.diagramImages) ? body.diagramImages : [],
      target,
      writeRepo: true,
      syncSupabase: body.syncSupabase !== false,
    });

    res.writeHead(out.ok ? out.status : out.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out.ok ? out.result : { errors: out.errors }));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(PORT, () => {
  console.log(`Slot guide ingest server → http://localhost:${PORT}/ingest`);
  console.log(`Health → http://localhost:${PORT}/health`);
  console.log("Set SLOT_GUIDE_WRITE_REPO via this server; writes Slots/ + public/guides/.");
});
