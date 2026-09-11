// One place that talks to the Anthropic Messages API. ANTHROPIC_API_KEY comes from the Vercel env.
export const MODEL = process.env.ASK_MODEL || "claude-sonnet-5";
export const QUICK_MODEL = process.env.ASK_QUICK_MODEL || "claude-haiku-4-5-20251001";
export const WEB_SEARCH = max_uses => ({ type: "web_search_20250305", name: "web_search", max_uses });

// web-search answers sometimes carry literal citation markup inside the text; it is noise for us
export const stripCites = t => String(t || "").replace(/(?:\(|<)\/?cite[^>]*>\)?/g, "").replace(/\s{2,}/g, " ");
export const textOf = content => stripCites((content || []).filter(b => b.type === "text").map(b => b.text).join(""));
export function jsonOf(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(s, e + 1));
}
export const todayPT = () => new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";

/** Throws {code, message, status} on failure. Returns {text, content, model, stop_reason, usage, searches}. */
export async function callClaude({ model = MODEL, system, messages, tools, max_tokens = 1500 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw { code: "no_key", message: "ANTHROPIC_API_KEY isn't set on Vercel", status: 503 };
  const payload = { model, max_tokens, messages };
  // cache the (long, stable) system prompt; continuation rounds also cache the search results they resend
  if (system) payload.system = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  if (tools && tools.length) payload.tools = tools;
  // A long web-search loop can come back with stop_reason "pause_turn": the turn is not finished and the
  // caller continues it by sending the content back as an assistant turn. Loop until a real stop.
  const turns = messages.slice();
  let text = "", searches = 0, usedModel = null, stop = null, content = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (let round = 0; round < 6; round++) {
    let r, j;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ ...payload, messages: turns }),
      });
      j = await r.json().catch(() => ({}));
    } catch (e) { throw { code: "api", message: `couldn't reach Anthropic: ${e.message || e}`, status: 502 }; }
    if (!r.ok) {
      const code = r.status === 429 ? "rate_limited" : r.status === 401 ? "bad_key" : r.status === 529 ? "overloaded" : "api";
      throw { code, message: (j.error && j.error.message) || `Anthropic ${r.status}`, status: r.status === 401 ? 503 : 502 };
    }
    content = content.concat(j.content || []);
    text += textOf(j.content); searches += (j.content || []).filter(b => b.type === "server_tool_use").length;
    usedModel = j.model; stop = j.stop_reason;
    if (j.usage) for (const k of Object.keys(usage)) usage[k] += j.usage[k] || 0;
    if (stop !== "pause_turn") break;
    const cont = (j.content || []).map(b => ({ ...b }));
    if (cont.length) cont[cont.length - 1].cache_control = { type: "ephemeral" };
    turns.push({ role: "assistant", content: cont });
  }
  return { text, content, model: usedModel, stop_reason: stop, usage, searches };
}
