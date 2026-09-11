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
 "lineup": [{"slot": "FLEX", "start": "player to put in", "sit": "player he comes out for, or null if the slot is empty", "why": "one sentence with the number that decides it", "urgency": "high|medium|low"}],
 "waivers": [{"add": "name", "pos": "RB", "team": "NFL team", "drop": "name on Danny's roster", "bid": 21, "why": "one sentence", "urgency": "high|medium|low"}],
 "flags": [{"player": "name on Danny's roster", "severity": "red|amber|green", "what": "status in a few words, with the date of the news"}],
 "watch": [{"player": "name", "what": "what to watch for and when"}],
 "alerts": [{"key": "stable-id-for-this-situation", "urgency": "high|medium|low", "title": "under 50 characters, starting with 🔴 🟡 🟢 or 💰", "body": "one or two sentences: what happened and exactly what to do, with the deadline"}]}
Field rules. "lineup" lists only changes to Danny's CURRENT starting lineup (an empty array when it is already right); never move a locked player. "waivers" lists only adds worth making now, best first, at most 4, each naming the drop and a whole-dollar odd bid out of the FAAB left (bid 0 while free agents are first-come). "flags" covers every player on Danny's roster who is not simply healthy and starting. "alerts" is what deserves a phone notification: a lineup change he must make, a claim he must place, a player another team just dropped that he should grab, or a material status change on one of his players. Urgency high = act before the next kickoff or today; medium = this week; low = FYI only, not pushed. Use the same key every time the same situation is reported (for example "lineup:nabers-out-wk1" or "waiver:michael-mayer-wk1") so he is not told twice; a new development gets a new key. When nothing warrants a push, "alerts" is an empty array.`;

const row = r => `${r.pos} ${r.name} (${r.team})${r.flag !== "green" ? ` [${r.flag.toUpperCase()}: ${r.why}]` : ""} · proj ${r.proj ?? "?"} · ${r.game || "?"}${r.locked ? " · LOCKED" : ""}`;

/** The situation, as text for Claude. */
export function contextText(sweep, { news = "", prev = null, notified = {}, reason = "" } = {}) {
  const L = [];
  L.push(`Now: ${nowPT()}. NFL week ${sweep.week}. Danny's record ${sweep.record}. FAAB $${sweep.faab_total - sweep.faab_used} left of $${sweep.faab_total}. Sleeper data as of ${sweep.generated}.`);
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
    for (const [pos, rows] of Object.entries(sweep.fa_top)) if (rows.length) L.push(`  ${pos}: ` + rows.map(r => `${r.name} (${r.team}, proj ${r.proj}, ${r.game}${r.flag !== "green" ? `, ${r.flag}: ${r.why}` : ""})`).join("; "));
  }
  if (sweep.trending.length) L.push(`Trending adds across Sleeper in the last 48h that are free agents here: ` + sweep.trending.map(r => `${r.pos} ${r.name} (${r.team}, ${r.adds} adds, proj ${r.proj}${r.flag !== "green" ? `, ${r.flag}: ${r.why}` : ""})`).join("; "));
  const recent = sweep.transactions.filter(t => t.ts && Date.now() - t.ts < 4 * 24 * H);
  if (recent.length) L.push(`League transactions in the last 4 days (newest first): ` + recent.map(t => `${fmt(t.ts)} ${t.team} ${t.type}${t.bid != null ? ` $${t.bid}` : ""}: added ${t.adds.join("/") || "-"}, dropped ${t.dropped.length ? t.dropped.map(d => `${d.name} (${d.pos} ${d.team}, proj ${d.proj}${d.fa ? ", STILL A FREE AGENT" : ", since claimed"})`).join("/") : (t.drops.join("/") || "-")}`).join("; "));
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

export async function runAdvisor({ trigger = "schedule", reason = "", news = "", push = true, dry = false, sweep = null, searches = 8 } = {}) {
  sweep = sweep || await buildSweep({ force: true });
  const prev = await kvGet("advice").catch(() => null);
  const notified = (await kvGet("notified").catch(() => null)) || {};
  const res = await callClaude({
    model: MODEL, max_tokens: 4000, tools: [WEB_SEARCH(searches)],
    system: `${RULES}\n\n${SCHEMA}\n\nYou have a web_search tool: use it (a few focused searches) for today's injury, practice-report, depth-chart and Vegas-total news on the players that decide the calls below, Danny's amber and red players first, then any player you are about to tell him to add or start. Mention the date of the news you rely on. Do not include URLs.`,
    messages: [{ role: "user", content: contextText(sweep, { news, prev, notified, reason }) + "\n\nProduce the JSON now." }],
  });
  let data;
  try { data = jsonOf(res.text); } catch (e) { throw { code: "invalid_json", message: `Claude's reply wasn't the JSON shape asked for: ${String(res.text).slice(0, 200)}`, status: 502 }; }
  const arr = k => Array.isArray(data[k]) ? data[k] : [];
  const advice = {
    ts: Date.now(), when: nowPT(), week: sweep.week, trigger, reason, generated: sweep.generated,
    headline: String(data.headline || "").trim(), summary: String(data.summary || "").trim(),
    lineup: arr("lineup"), waivers: arr("waivers"), flags: arr("flags"), watch: arr("watch"), alerts: arr("alerts"),
    projections: sweep.lineup ? { current: sweep.lineup.current_pts, optimal: sweep.lineup.optimal_pts, start: sweep.lineup.start, sit: sweep.lineup.sit } : null,
    faab_left: sweep.faab_total - sweep.faab_used,
    model: res.model, searches: res.searches, usage: res.usage && { in: res.usage.input_tokens, out: res.usage.output_tokens },
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
