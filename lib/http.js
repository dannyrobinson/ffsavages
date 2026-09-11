// Small helpers shared by the API routes.
import { kvGet, kvSet } from "./db.js";
export const NO = { "cache-control": "no-store" };
export const bad = (code, error, status = 400) => Response.json({ ok: false, code, error }, { status, headers: NO });
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;                      // no Origin header: not a browser cross-site call
  try { return new URL(origin).host === req.headers.get("host"); } catch { return false; }
}
export function cronAuthed(req) {
  const secret = process.env.CRON_SECRET;
  return !!secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}
export const dayPT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });   // YYYY-MM-DD
/** Count one use of `name` today; false when the cap is hit. A DB hiccup lets the request through. */
export async function underCap(name, cap) {
  const key = `${name}:${dayPT()}`;
  try {
    const v = await kvGet(key); const n = (v && v.n) || 0;
    if (n >= cap) return false;
    await kvSet(key, { n: n + 1 });
  } catch { /* counter unavailable */ }
  return true;
}
