import { sql } from "../lib/db.js";
import { sendOne } from "../lib/push.js";
import { nowPT } from "../lib/sleeper.js";

const bad = (msg, status = 400) => Response.json({ ok: false, error: msg }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return bad("expected JSON"); }
  const { action, subscription, endpoint, ua } = body || {};
  if (action === "subscribe") {
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) return bad("bad subscription");
    if (!/^https:\/\//.test(subscription.endpoint)) return bad("bad endpoint");
    await sql`insert into push_subscriptions (endpoint, subscription, user_agent) values (${subscription.endpoint}, ${JSON.stringify(subscription)}::jsonb, ${String(ua || "").slice(0, 300)})
              on conflict (endpoint) do update set subscription = excluded.subscription, user_agent = excluded.user_agent, fails = 0`;
    const welcome = await sendOne(subscription, {
      title: "Robinsavages alerts are on", tag: "rsv-welcome", url: "./",
      body: "You'll get a push when one of your players' status changes, or a starting QB hits waivers. Checked every 15 minutes.",
    });
    return Response.json({ ok: true, welcome }, { headers: { "cache-control": "no-store" } });
  }
  if (action === "unsubscribe") {
    if (!endpoint) return bad("endpoint required");
    await sql`delete from push_subscriptions where endpoint = ${endpoint}`;
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }
  if (action === "test") {
    if (!endpoint) return bad("endpoint required");
    const rows = await sql`select subscription from push_subscriptions where endpoint = ${endpoint}`;
    if (!rows.length) return bad("not subscribed on the server — turn alerts off and on again", 404);
    const r = await sendOne(rows[0].subscription, { title: "Test alert", tag: "rsv-test", url: "./", body: `Push is working. Sent ${nowPT()}.` });
    return Response.json({ ok: r.ok, result: r }, { headers: { "cache-control": "no-store" } });
  }
  return bad("unknown action");
}
