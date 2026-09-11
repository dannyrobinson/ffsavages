// Danny's auto-sub note for the week. Sleeper's public API does not say which AutoSubs a manager has set (that is
// behind the authenticated GraphQL), so the app records what he set (Moves tab, Auto-subs card) and the advisor
// reads it (kv "subs" = {week, text, ts}). GET returns it; POST (same-origin) replaces it.
import { kvGet, kvSet } from "../lib/db.js";
import { bad, sameOrigin, NO } from "../lib/http.js";

export async function GET() {
  return Response.json({ ok: true, subs: await kvGet("subs").catch(() => null) }, { headers: NO });
}

export async function POST(req) {
  if (!sameOrigin(req)) return bad("origin", "cross-origin request refused", 403);
  let body; try { body = await req.json(); } catch { return bad("bad_request", "expected JSON"); }
  const subs = { week: Number(body && body.week) || null, text: String((body && body.text) || "").trim().slice(0, 1000), ts: Date.now() };
  try { await kvSet("subs", subs); } catch (e) { return bad("db", `could not save: ${String(e.message || e).slice(0, 120)}`, 502); }
  return Response.json({ ok: true, subs }, { headers: NO });
}
