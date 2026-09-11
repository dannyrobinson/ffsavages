// api/ask.js — Claude behind the GM app's "What should I do next?", Ask tab and screenshot reader.
// Talks to the Anthropic Messages API directly with ANTHROPIC_API_KEY from the Vercel env, so the
// installed phone app works without the claude.ai artifact runtime. Web search is on for advice so
// the answer reflects today's injury news, not just the Sleeper flags.
//
// POST { mode: "moves" | "chat" | "shot", system?: string, messages: [{role, content}], image?: {media_type, data} }
//   moves → { ok, text, data }   (data = the JSON object Claude was asked for)
//   chat  → { ok, text }
//   shot  → { ok, text }         (image attached to the last user turn; quick model, no search)
// Guards: same-origin only, a daily request cap (ASK_DAILY_CAP, default 60, counted in the kv table),
// size limits. Env: ANTHROPIC_API_KEY (required), ASK_MODEL, ASK_QUICK_MODEL, ASK_DAILY_CAP.
import { kvGet, kvSet } from "../lib/db.js";

const MODEL = process.env.ASK_MODEL || "claude-sonnet-5";
const QUICK_MODEL = process.env.ASK_QUICK_MODEL || "claude-haiku-4-5-20251001";
const CAP = Math.max(1, +(process.env.ASK_DAILY_CAP || 60));
const NO = { "cache-control": "no-store" };
const bad = (code, error, status = 400) => Response.json({ ok: false, code, error }, { status, headers: NO });

function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;                      // no Origin header: not a browser cross-site call
  try { return new URL(origin).host === req.headers.get("host"); } catch { return false; }
}
const dayPT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });   // YYYY-MM-DD
const todayPT = () => new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", year: "numeric", month: "long", day: "numeric" });
async function underCap() {
  const key = `ask:${dayPT()}`;
  try {
    const v = await kvGet(key); const n = (v && v.n) || 0;
    if (n >= CAP) return false;
    await kvSet(key, { n: n + 1 });
  } catch { /* counter unavailable: don't block Danny over a DB hiccup */ }
  return true;
}
export const textOf = content => (content || []).filter(b => b.type === "text").map(b => b.text).join("");
export function jsonOf(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(s, e + 1));
}
const SEARCH_NOTE = `\n\nToday is ${todayPT()} (Pacific). You have a web_search tool: before advising, run a few searches for today's injury, practice-report and depth-chart news on the players that matter (Danny's amber and red players first, then any waiver target you are about to recommend). Fold what you learn into the answer and mention the date of the news; do not list sources or URLs.`;

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) return bad("no_key", "ANTHROPIC_API_KEY isn't set on Vercel", 503);
  if (!sameOrigin(req)) return bad("origin", "cross-origin request refused", 403);
  let body;
  try { body = await req.json(); } catch { return bad("bad_request", "expected JSON"); }
  const { mode, system, messages, image } = body || {};
  if (!["moves", "chat", "shot"].includes(mode)) return bad("bad_request", "mode must be moves, chat or shot");
  if (!Array.isArray(messages) || !messages.length) return bad("bad_request", "messages required");
  if (JSON.stringify(messages).length + String(system || "").length > 200_000) return bad("prompt_too_large", "prompt too large", 413);

  const quick = mode === "shot";
  const msgs = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();      // the API wants a user turn first
  if (!msgs.length) return bad("bad_request", "no user turn");
  if (image && image.data) {
    if (String(image.data).length > 7_000_000) return bad("prompt_too_large", "image too large", 413);
    const last = msgs[msgs.length - 1];
    last.content = [{ type: "image", source: { type: "base64", media_type: image.media_type || "image/png", data: image.data } }, { type: "text", text: last.content }];
  }
  if (!(await underCap())) return bad("cap", `daily limit of ${CAP} Claude requests reached; it resets at midnight Pacific`, 429);

  const search = !quick && body.search !== false;
  const payload = {
    model: quick ? QUICK_MODEL : MODEL,
    max_tokens: mode === "moves" ? 3000 : 1500,
    messages: msgs,
  };
  if (system) payload.system = String(system) + (search ? SEARCH_NOTE : "");
  if (search) payload.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: mode === "moves" ? 6 : 3 }];

  let r, j;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) { return bad("api", `couldn't reach Anthropic: ${e.message || e}`, 502); }
  if (!r.ok) {
    const code = r.status === 429 ? "rate_limited" : r.status === 401 ? "bad_key" : r.status === 529 ? "overloaded" : "api";
    return bad(code, (j.error && j.error.message) || `Anthropic ${r.status}`, r.status === 401 ? 503 : 502);
  }
  const text = textOf(j.content);
  const out = { ok: true, text, model: j.model, stop: j.stop_reason, usage: j.usage };
  if (mode === "moves") { try { out.data = jsonOf(text); } catch { return bad("invalid_json", "the reply wasn't the JSON shape asked for", 502); } }
  return Response.json(out, { headers: NO });
}
