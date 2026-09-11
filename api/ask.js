// api/ask.js — Claude behind the app's Ask tab and screenshot reader.
//   POST { mode: "chat", news?: string, messages: [{role, content}] }        -> { ok, text }
//   POST { mode: "shot", messages: [{role, content}], image: {media_type, data} } -> { ok, text }
// Chat gets the same context the advisor uses (fresh sweep, projections, latest advice) plus web search,
// so Danny's questions are answered against today's numbers. Same-origin only; ASK_DAILY_CAP per day.
import { buildSweep } from "../lib/sleeper.js";
import { kvGet } from "../lib/db.js";
import { RULES } from "../lib/rules.js";
import { contextText } from "../lib/advise.js";
import { callClaude, MODEL, QUICK_MODEL, WEB_SEARCH, todayPT } from "../lib/claude.js";
import { bad, sameOrigin, underCap, NO } from "../lib/http.js";

const CAP = Math.max(1, +(process.env.ASK_DAILY_CAP || 60));
let sweepCache = { ts: 0, sweep: null };
async function sweepFor() {
  if (sweepCache.sweep && Date.now() - sweepCache.ts < 2 * 60 * 1000) return sweepCache.sweep;
  const sweep = await buildSweep({ force: true }); sweepCache = { ts: Date.now(), sweep }; return sweep;
}

export async function POST(req) {
  if (!sameOrigin(req)) return bad("origin", "cross-origin request refused", 403);
  let body;
  try { body = await req.json(); } catch { return bad("bad_request", "expected JSON"); }
  const { mode, messages, image, news } = body || {};
  if (!["chat", "shot"].includes(mode)) return bad("bad_request", "mode must be chat or shot");
  if (!Array.isArray(messages) || !messages.length) return bad("bad_request", "messages required");
  if (JSON.stringify(messages).length > 100_000) return bad("prompt_too_large", "prompt too large", 413);
  const msgs = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();      // the API wants a user turn first
  if (!msgs.length) return bad("bad_request", "no user turn");
  if (!(await underCap("ask", CAP))) return bad("cap", `daily limit of ${CAP} Claude requests reached; it resets at midnight Pacific`, 429);

  try {
    if (mode === "shot") {
      if (!image || !image.data) return bad("bad_request", "image required");
      if (String(image.data).length > 7_000_000) return bad("prompt_too_large", "image too large", 413);
      const last = msgs[msgs.length - 1];
      last.content = [{ type: "image", source: { type: "base64", media_type: image.media_type || "image/jpeg", data: image.data } }, { type: "text", text: last.content }];
      const res = await callClaude({ model: QUICK_MODEL, max_tokens: 1200, messages: msgs });
      return Response.json({ ok: true, text: res.text, model: res.model, usage: res.usage }, { headers: NO });
    }
    const [sweep, advice] = await Promise.all([sweepFor(), kvGet("advice").catch(() => null)]);
    const system = `${RULES}\n\n${contextText(sweep, { news: String(news || "").slice(0, 20000), prev: advice, reason: "Danny is asking a question in the app" })}` +
      (advice ? `\n\nYour latest full advice (${advice.when}): ${advice.headline} ${advice.summary} Lineup changes: ${(advice.lineup || []).map(l => `${l.slot}: ${l.start} over ${l.sit || "empty"}`).join("; ") || "none"}. Waivers: ${(advice.waivers || []).map(w => `${w.add} for ${w.drop} $${w.bid}`).join("; ") || "none"}.` : "") +
      `\n\nToday is ${todayPT()}. Answer Danny's question conversationally and briefly: a short paragraph or a few lines of plain text, no markdown, no URLs. Be decisive; say what you'd do and why in one breath, with the numbers that decide it. You have a web_search tool for anything that depends on today's news.`;
    const res = await callClaude({ model: MODEL, max_tokens: 1200, system, messages: msgs, tools: [WEB_SEARCH(3)] });
    return Response.json({ ok: true, text: res.text, model: res.model, searches: res.searches, usage: res.usage }, { headers: NO });
  } catch (e) {
    return Response.json({ ok: false, code: e.code || "error", error: String(e.message || e) }, { status: e.status || 502, headers: NO });
  }
}
