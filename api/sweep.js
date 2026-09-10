import { buildSweep } from "../lib/sleeper.js";
export async function GET(req) {
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const sweep = await buildSweep({ force: fresh });
    return Response.json(sweep, { headers: { "cache-control": fresh ? "no-store" : "public, s-maxage=120, stale-while-revalidate=600" } });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
