// Runs the advisor. GET from Vercel Cron (Authorization: Bearer $CRON_SECRET; ?dry=1 to skip pushes and
// storage). POST from the app (same-origin; body {news}) for an on-demand re-check that returns the advice.
import { runAdvisor } from "../lib/advise.js";
import { bad, cronAuthed, sameOrigin, underCap, NO } from "../lib/http.js";

const ADVISE_CAP = Math.max(1, +(process.env.ADVISE_DAILY_CAP || 40));
const errJson = e => Response.json({ ok: false, code: e.code || "error", error: String(e.message || e) }, { status: e.status || 502, headers: NO });

export async function GET(req) {
  if (!cronAuthed(req)) return bad("unauthorized", "unauthorized", 401);
  const url = new URL(req.url);
  const dry = url.searchParams.has("dry");
  if (!dry && !(await underCap("advise", ADVISE_CAP))) return bad("cap", `advisor daily cap of ${ADVISE_CAP} reached`, 429);
  try { return Response.json(await runAdvisor({ trigger: "schedule", reason: "scheduled check", dry }), { headers: NO }); }
  catch (e) { return errJson(e); }
}

export async function POST(req) {
  if (!sameOrigin(req)) return bad("origin", "cross-origin request refused", 403);
  let body; try { body = await req.json(); } catch { body = {}; }
  const news = String((body && body.news) || "").slice(0, 20000);
  if (!(await underCap("advise", ADVISE_CAP))) return bad("cap", `advisor daily cap of ${ADVISE_CAP} reached; it resets at midnight Pacific`, 429);
  try {
    const res = await runAdvisor({ trigger: "app", reason: "Danny asked for a fresh read from the app" + (news ? " and pasted news" : ""), news, push: false });
    return Response.json({ ok: true, advice: res.advice }, { headers: NO });
  } catch (e) { return errJson(e); }
}
