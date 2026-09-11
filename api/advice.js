// The latest stored advice, for the app's Moves tab.
import { kvGet } from "../lib/db.js";
import { NO } from "../lib/http.js";
export async function GET() {
  const advice = await kvGet("advice").catch(() => null);
  return Response.json({ ok: true, advice }, { headers: NO });
}
