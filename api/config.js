import { sql, kvGet } from "../lib/db.js";
export async function GET() {
  const [lastCheck, rows] = await Promise.all([kvGet("last_check").catch(() => null), sql`select count(*)::int as n from push_subscriptions`.catch(() => [{ n: null }])]);
  return Response.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null, lastCheck, subscribers: rows[0] && rows[0].n, ask: !!process.env.ANTHROPIC_API_KEY },
    { headers: { "cache-control": "no-store" } });
}
