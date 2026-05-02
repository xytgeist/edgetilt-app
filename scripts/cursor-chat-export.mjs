/**
 * Appends new Cursor agent-transcript lines to a markdown log file.
 * Run on a schedule via Register-CursorChatExportScheduledTask-Laptop.ps1 or -Desktop.ps1.
 *
 * Env:
 *   CURSOR_AGENT_TRANSCRIPTS — override folder containing per-chat UUID dirs with *.jsonl
 *   CHAT_EXPORT_HANDOFF — output markdown file (required for machine-specific runners)
 *   CHAT_EXPORT_STATE_ID — suffix for .cursor/chat-export-state-<id>.json (default: default)
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");
const defaultHandoff = path.join(workspaceRoot, "20260430_SESSION_HANDOFF.md");
const handoffPath = process.env.CHAT_EXPORT_HANDOFF
  ? path.resolve(process.env.CHAT_EXPORT_HANDOFF)
  : defaultHandoff;

const stateIdRaw = process.env.CHAT_EXPORT_STATE_ID || "default";
const stateId = /^[a-zA-Z0-9_-]+$/.test(stateIdRaw) ? stateIdRaw : "default";

function cursorProjectSlugFromWorkspace(absWorkspace) {
  const parts = path.resolve(absWorkspace).split(path.sep).filter(Boolean);
  if (parts.length === 0) return "unknown-workspace";
  const drive = parts[0].replace(":", "").toLowerCase();
  const rest = parts.slice(1).join("-");
  return `${drive}-${rest}`;
}

function defaultTranscriptsRoot() {
  if (process.env.CURSOR_AGENT_TRANSCRIPTS) {
    return path.resolve(process.env.CURSOR_AGENT_TRANSCRIPTS);
  }
  const slug = cursorProjectSlugFromWorkspace(workspaceRoot);
  return path.join(os.homedir(), ".cursor", "projects", slug, "agent-transcripts");
}

const stateDir = path.join(workspaceRoot, ".cursor");
const statePath = path.join(stateDir, `chat-export-state-${stateId}.json`);

async function findLatestJsonl(root) {
  if (!fs.existsSync(root)) return null;
  const entries = await fsp.readdir(root, { withFileTypes: true });
  let best = null;
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    const inner = path.join(dir, `${d.name}.jsonl`);
    if (!fs.existsSync(inner)) continue;
    const st = await fsp.stat(inner);
    if (!best || st.mtimeMs > best.mtimeMs) {
      best = { file: inner, mtimeMs: st.mtimeMs };
    }
  }
  return best?.file ?? null;
}

function extractMessageBody(obj) {
  const role = obj.role || "unknown";
  const parts = obj.message?.content;
  if (!Array.isArray(parts)) return { role, body: "" };
  const texts = [];
  for (const p of parts) {
    if (p?.type === "text" && typeof p.text === "string") texts.push(p.text);
  }
  const joined = texts.join("\n");
  const m = joined.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  const body = m ? m[1].trim() : joined.replace(/\[REDACTED\]\s*/g, "").trim();
  return { role, body };
}

async function readState() {
  try {
    const raw = await fsp.readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { file: null, line: 0 };
  }
}

async function writeState(s) {
  await fsp.mkdir(stateDir, { recursive: true });
  await fsp.writeFile(statePath, JSON.stringify(s, null, 2), "utf8");
}

async function main() {
  const transcriptsRoot = defaultTranscriptsRoot();
  const jsonlPath = await findLatestJsonl(transcriptsRoot);
  if (!jsonlPath) {
    process.stderr.write(
      `[cursor-chat-export] No agent transcript .jsonl found under ${transcriptsRoot}\n`
    );
    return;
  }

  let state = await readState();
  if (state.file !== jsonlPath) {
    state = { file: jsonlPath, line: 0 };
  }

  const raw = await fsp.readFile(jsonlPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const start = Math.min(state.line, lines.length);
  const slice = lines.slice(start);
  if (slice.length === 0) return;

  const blocks = [];
  for (const line of slice) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const { role, body } = extractMessageBody(obj);
    if (!body) continue;
    const label = role === "user" ? "User" : role === "assistant" ? "Assistant" : role;
    blocks.push(`### ${label}\n\n${body}\n`);
  }

  if (blocks.length === 0) {
    await writeState({ file: jsonlPath, line: lines.length });
    return;
  }

  const stamp = new Date().toISOString();
  const header = `\n---\n\n## Chat export (${stamp})\n\n_Source: \`${path.basename(path.dirname(jsonlPath))}\` — lines ${start + 1}–${lines.length}_\n\n`;
  const chunk = header + blocks.join("\n");

  await fsp.appendFile(handoffPath, chunk, "utf8");
  await writeState({ file: jsonlPath, line: lines.length });
  process.stdout.write(
    `[cursor-chat-export] Appended ${blocks.length} message(s) to ${handoffPath}\n`
  );
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(1);
});
