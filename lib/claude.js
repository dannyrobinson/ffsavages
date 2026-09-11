// One place that talks to the Anthropic Messages API. ANTHROPIC_API_KEY comes from the Vercel env.
export const MODEL = process.env.ASK_MODEL || "claude-sonnet-5";
export const QUICK_MODEL = process.env.ASK_QUICK_MODEL || "claude-haiku-4-5-20251001";
export const WEB_SEARCH = max_uses => ({ type: "web_search_20250305", name: "web_search", max_uses });

export const textOf = content => (content || []).filter(b => b.type === "text").map(b => b.text).join("");
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
  if (system) payload.system = system;
  if (tools && tools.length) payload.tools = tools;
  let r, j;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) { throw { code: "api", message: `couldn't reach Anthropic: ${e.message || e}`, status: 502 }; }
  if (!r.ok) {
    const code = r.status === 429 ? "rate_limited" : r.status === 401 ? "bad_key" : r.status === 529 ? "overloaded" : "api";
    throw { code, message: (j.error && j.error.message) || `Anthropic ${r.status}`, status: r.status === 401 ? 503 : 502 };
  }
  const searches = (j.content || []).filter(b => b.type === "server_tool_use").length;
  return { text: textOf(j.content), content: j.content, model: j.model, stop_reason: j.stop_reason, usage: j.usage, searches };
}
