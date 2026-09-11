// The advisor: fresh Sleeper sweep + projections + web search -> Claude -> structured advice, stored in kv
// and pushed to Danny's phone when something needs doing. Runs hourly (api/advise cron), whenever the
// 15-minute checker sees a change (lib/check.js), and on demand from the app.
import { buildSweep, nowPT } from "./sleeper.js";
import { kvGet, kvSet } from "./db.js";
import { sendAll } from "./push.js";
import { RULES } from "./rules.js";
import { callClaude, jsonOf, WEB_SEARCH, MODEL } from "./claude.js";

const TZ = "America/Vancouver";
const fmt = ms => new Date(ms).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });
const H = 3600 * 1000;
const RESEND_AFTER = { high: 12 * H, medium: 72 * H };   // same key again only after this long
const MAX_PUSH_PER_RUN = 4;

export const SCHEMA = `Reply with only JSON, no prose before or after, in exactly this shape:
{"headline": "one sentence: the single most important thing Danny should do right now, with the deadline (kickoff in Pacific time) when there is one",
 "summary": "two or three sentences on where the team stands this week and why",
 "lineup": [{"slot": "FLEX", "start": "player to put in", "sit": "player he comes out for, or null if the slot is empty", "why": "one sentence with the number that decides it", "evidence": "the dated facts you verified for BOTH players (role, injury, who is ahead of him)", "urgency": "high|medium|low"}],
 "waivers": [{"add": "name", "pos": "RB", "team": "NFL team", "drop": "name on Danny's roster", "bid": 21, "claim": true, "why": "one sentence", "evidence": "the dated facts you verified for the add AND the drop, including the status of whoever is ahead of each on his NFL depth chart", "urgency": "high|medium|low"}],
 "flags": [{"player": "name on Danny's roster", "severity": "red|amber|green", "what": "status in a few words, with the date of the news"}],
 "watch": [{"player": "name", "what": "what to watch for and when"}],
 "alerts": [{"key": "stable-id-for-this-situation", "urgency": "high|medium|low", "title": "under 50 characters, starting with 🔴 🟡 🟢 (a player's status), 🔁 (a lineup change) or ➕ (an add)", "body": "one or two sentences: what happened and exactly what to do, with the deadline"}]}
Field rules. "evidence" is mandatory on every lineup and waiver item and must come from what you checked today (the room shown in the data, plus a search dated within 5 days); an item whose drop or sit is justified only by memory of last season's depth chart is wrong and must not be output. "lineup" lists only changes to Danny's CURRENT starting lineup (an empty array when it is already right); never move a locked player. "waivers" lists only adds worth making now, best first, at most 4, each naming the drop; "claim": true with an odd whole-number "bid" (at least 1, out of the FAAB left) when the player is on waivers, or "claim": false and "bid": 0 when he is a free agent right now and can simply be added. FAAB is a notional budget, never call it money. "flags" covers every player on Danny's roster who is not simply healthy and starting. "alerts" is what deserves a phone notification: a lineup change he must make, a claim he must place, a player another team just dropped that he should grab, or a material status change on one of his players. Urgency high = act before the next kickoff or today; medium = this week; low = FYI only, not pushed. Use the same key every time the same situation is reported (for example "lineup:nabers-out-wk1" or "waiver:michael-mayer-wk1") so he is not told twice; a new development gets a new key. When nothing warrants a push, "alerts" is an empty array.`;

const row = r => `${r.pos} ${r.name} (${r.team})${r.flag !== "green" ? ` [${r.flag.toUpperCase()}: ${r.why}]` : ""} · proj ${r.proj ?? "?"} · ${r.game || "?"}${r.locked ? " · LOCKED" : ""}${r.room ? ` · room: ${r.room}` : ""}`;

/** The situation, as text for Claude. */
export function contextText(sweep, { news = "", prev = null, notified = {}, reason = "" } = {}) {
  const L = [];
  L.push(`Now: ${nowPT()}. NFL week ${sweep.week}. Danny's record ${sweep.record}. FAAB ${sweep.faab_total - sweep.faab_used} of ${sweep.faab_total} left (notional budget). Sleeper data as of ${sweep.generated}.`);
  L.push(`Danny's roster (slot · player · Sleeper flag · projected points this week under this league's scoring · game):`);
  for (const r of sweep.roster) L.push(`  ${r.slot.padEnd(5)} ${row(r)}`);
  const lu = sweep.lineup;
  if (lu) {
    L.push(`Current starting lineup projects to ${lu.current_pts} points: ` + lu.current.map(c => `${c.slot} ${c.name || "EMPTY"} ${c.proj}`).join(", "));
    L.push(`Best lineup by projection alone: ${lu.optimal_pts} points` + (lu.start.length || lu.sit.length ? ` (start ${lu.start.join(", ") || "-"}; sit ${lu.sit.join(", ") || "-"})` : " (same as current)") + ". Projections do not know today's news; you do.");
  }
  const o = sweep.opponent;
  if (o && o.team) L.push(`This week's opponent: ${o.team} (${o.record}), starters project ${o.proj_pts}: ` + o.starters.map(row).join("; "));
  L.push(`Free-agent QBs who start for their NFL team (nobody in this league has them): ` + (sweep.fa_qbs.length ? sweep.fa_qbs.map(row).join("; ") : "none"));
  if (sweep.fa_top) {
    L.push(`Best free agents in THIS league by projection this week:`);
    for (const [pos, rows] of Object.entries(sweep.fa_top)) if (rows.length) L.push(`  ${pos}: ` + rows.map(r => `${r.name} (${r.team}, proj ${r.proj}, ${r.game}${r.flag !== "green" ? `, ${r.flag}: ${r.why}` : ""}${r.room ? `; room: ${r.room}` : ""})`).join("; "));
  }
  if (sweep.trending.length) L.push(`Trending adds across Sleeper in the last 48h that are free agents here: ` + sweep.trending.map(r => `${r.pos} ${r.name} (${r.team}, ${r.adds} adds, proj ${r.proj}${r.flag !== "green" ? `, ${r.flag}: ${r.why}` : ""}${r.room ? `; room: ${r.room}` : ""})`).join("; "));
  const recent = sweep.transactions.filter(t => t.ts && Date.now() - t.ts < 4 * 24 * H);
  if (recent.length) L.push(`League transactions in the last 4 days (newest first): ` + recent.map(t => `${fmt(t.ts)} ${t.team} ${t.type}${t.bid != null ? ` (FAAB ${t.bid})` : ""}: added ${t.adds.join("/") || "-"}, dropped ${t.dropped.length ? t.dropped.map(d => `${d.name} (${d.pos} ${d.team}, proj ${d.proj}${d.fa ? ", STILL A FREE AGENT" : ", since claimed"})`).join("/") : (t.drops.join("/") || "-")}`).join("; "));
  L.push(`QBs rostered per team (2 = a buyer for a spare QB): ` + sweep.qb_depth.map(q => `${q.team} ${q.n}`).join(", "));
  if (news && news.trim()) L.push(`Danny's own news log, pasted from his phone (newest first):\n${news.trim()}`);
  if (prev && prev.headline) L.push(`Your previous advice (${fmt(prev.ts)}): "${prev.headline}"`);
  const sentKeys = Object.entries(notified).filter(([, ts]) => Date.now() - ts < 4 * 24 * H).map(([k, ts]) => `${k} (${fmt(ts)})`);
  if (sentKeys.length) L.push(`Alerts already pushed to his phone recently (reuse the key if it is the same situation): ${sentKeys.join(", ")}`);
  L.push(`Why this run is happening: ${reason || "scheduled check"}.`);
  return L.join("\n");
}

function shouldSend(a, notified) {
  if (!a || !a.key || !["high", "medium"].includes(a.urgency)) return false;
  const last = notified[a.key];
  return !last || Date.now() - last > RESEND_AFTER[a.urgency];
}

export async function runAdvisor({ trigger = "schedule", reason = "", news = "", push = true, dry = false, sweep = null, searches = 10 } = {}) {
  sweep = sweep || await buildSweep({ force: true });
  const prev = await kvGet("advice").catch(() => null);
  const notified = (await kvGet("notified").catch(() => null)) || {};
  const user = contextText(sweep, { news, prev, notified, reason }) + "\n\nProduce the JSON now.";
  const call = withSearch => callClaude({
    model: MODEL, max_tokens: 32000, tools: withSearch ? [WEB_SEARCH(searches)] : undefined,   // search results count against max_tokens
    system: `${RULES}\n\n${SCHEMA}` + (withSearch ? `\n\nYou have a web_search tool. Research order, one focused search each, before you write anything: (1) Danny's amber and red players; (2) every player you intend to name in a lineup change or an add/drop, BOTH sides of each swap, searching "<name> <NFL team> news" for role, injury, suspension or exempt-list status and the status of whoever is ahead of him on the depth chart; (3) any bench player whose room shows him as his team's #1 while his projection is low, because that projection is stale. If a search contradicts the room shown in the data, prefer the newer, dated source and say so. Mention the date of the news you rely on. Do not include URLs. Only give advice you have checked this way; if you ran out of searches before checking a swap, leave that swap out and put the player in "watch" instead.` : ""),
    messages: [{ role: "user", content: user }],
  });
  let res = await call(true), data;
  try { data = jsonOf(res.text); }
  catch (e) {
    // no usable JSON (usually the search loop ran out of room): one more try on Sleeper data alone
    const first = `stop_reason ${res.stop_reason}, ${res.searches} searches, ${res.text.length} chars`;
    res = await call(false);
    try { data = jsonOf(res.text); res.fallback = first; }
    catch (e2) { throw { code: "invalid_json", message: `Claude's reply wasn't the JSON shape asked for (with search: ${first}; without: stop_reason ${res.stop_reason}, ${res.text.length} chars): ${String(res.text).slice(0, 200)}`, status: 502 }; }
  }
  const arr = k => Array.isArray(data[k]) ? data[k] : [];
  const advice = {
    ts: Date.now(), when: nowPT(), week: sweep.week, trigger, reason, generated: sweep.generated,
    headline: String(data.headline || "").trim(), summary: String(data.summary || "").trim(),
    lineup: arr("lineup"), waivers: arr("waivers"), flags: arr("flags"), watch: arr("watch"), alerts: arr("alerts"),
    projections: sweep.lineup ? { current: sweep.lineup.current_pts, optimal: sweep.lineup.optimal_pts, start: sweep.lineup.start, sit: sweep.lineup.sit } : null,
    faab_left: sweep.faab_total - sweep.faab_used,
    model: res.model, searches: res.searches, fallback: res.fallback || null, usage: res.usage && { in: res.usage.input_tokens, out: res.usage.output_tokens },
  };
  const sent = [];
  if (!dry) {
    if (push) {
      for (const a of advice.alerts) {
        if (sent.length >= MAX_PUSH_PER_RUN || !shouldSend(a, notified)) continue;
        const results = await sendAll({ title: String(a.title).slice(0, 80), body: String(a.body).slice(0, 300), tag: `rsv-${String(a.key).slice(0, 60)}`, url: "./" });
        notified[a.key] = Date.now();
        sent.push({ key: a.key, title: a.title, delivered: results.filter(r => r.ok).length });
      }
    }
    for (const [k, ts] of Object.entries(notified)) if (Date.now() - ts > 7 * 24 * H) delete notified[k];
    advice.pushed = sent.map(s => s.key);
    await kvSet("advice", advice);
    await kvSet("notified", notified);
  }
  return { ok: true, dry, advice, sent };
}
