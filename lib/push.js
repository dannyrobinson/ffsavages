import webpush from "web-push";
import { sql } from "./db.js";

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not set");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://robinsavages.vercel.app", pub, priv);
  configured = true;
}

/** Send one payload to one subscription. Returns {ok, status, gone}. Dead subscriptions (404/410) are deleted. */
export async function sendOne(subscription, payload) {
  configure();
  try {
    const r = await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    await sql`update push_subscriptions set last_ok = now(), fails = 0 where endpoint = ${subscription.endpoint}`.catch(() => {});
    return { ok: true, status: r.statusCode };
  } catch (e) {
    const status = e.statusCode || 0;
    if (status === 404 || status === 410) {
      await sql`delete from push_subscriptions where endpoint = ${subscription.endpoint}`.catch(() => {});
      return { ok: false, status, gone: true };
    }
    await sql`update push_subscriptions set fails = fails + 1 where endpoint = ${subscription.endpoint}`.catch(() => {});
    return { ok: false, status, error: String(e.body || e.message || e).slice(0, 200) };
  }
}

/** Send one payload to every subscriber. */
export async function sendAll(payload) {
  const rows = await sql`select subscription from push_subscriptions`;
  const results = [];
  for (const row of rows) results.push(await sendOne(row.subscription, payload));
  return results;
}
