// Runs every 15 minutes from Vercel Cron (vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// Manual: curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/check?dry=1
import { runCheck } from "../lib/check.js";

async function handle(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.has("dry");
  try {
    const res = await runCheck({ dry });
    return Response.json(res, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
export const GET = handle;
export const POST = handle;
