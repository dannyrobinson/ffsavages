// The 15-minute checker: rebuild the sweep, diff Danny's world against the last run, and when anything
// moved (a flag or injury change on his player, a lineup or roster edit, a league transaction, a new
// free-agent QB) hand it to the advisor, which decides what deserves a push. A red flag on one of his
// starters is pushed immediately as well, so a Claude outage can't hide it.
import { buildSweep } from "./sleeper.js";
import { kvGet, kvSet } from "./db.js";
import { sendAll } from "./push.js";
import { runAdvisor } from "./advise.js";

const MAX_ALERTS = 8;
const EMOJI = { red: "🔴", amber: "🟡", green: "🟢" };
const MY_TEAM = "Robinsavages";

function snapshot(sweep) {
  const players = {};
  for (const r of sweep.roster) {
    players[r.id] = { name: r.name, pos: r.pos, team: r.team, slot: r.slot, flag: r.flag, why: r.why, injury: r.injury || null };
  }
  return {
    week: sweep.week, ts: sweep.generated_ms, players, fa_qbs: sweep.fa_qbs.map(q => q.id),
    starters: sweep.roster.filter(r => r.slot === "START").map(r => r.id).sort(),
    tx_seen: sweep.transactions.map(t => t.id).filter(Boolean),
  };
}

/** Alerts worth a push, comparing the current snapshot with the previous one. */
export function diffAlerts(prev, cur) {
  const alerts = [];
  if (!prev) return alerts; // first run: nothing to compare with
  for (const [pid, p] of Object.entries(cur.players)) {
    const was = prev.players[pid];
    if (!was) continue; // he added the player himself
    const starting = p.slot === "START";
    const label = p.injury || p.why;
    if (p.flag !== was.flag) {
      if (p.flag === "red") alerts.push({
        title: `${EMOJI.red} ${p.name}: ${label}`, tag: `rsv-${pid}`, critical: starting,
        body: `${p.why}.${starting ? " He is in your starting lineup — swap him out before lock." : " He is on your bench."}`,
      });
      else if (p.flag === "amber") alerts.push({
        title: `${EMOJI.amber} ${p.name}: ${label}`, tag: `rsv-${pid}`,
        body: `${p.why}.${starting ? " Check the practice trend before he locks." : " He is on your bench."}`,
      });
      else alerts.push({
        title: `${EMOJI.green} ${p.name} cleared`, tag: `rsv-${pid}`,
        body: `${was.injury ? "Sleeper now lists him healthy and starting." : "Sleeper now lists him as a starter."}${starting ? "" : " He is on your bench — worth a lineup look."}`,
      });
    } else if ((p.injury || "") !== (was.injury || "") && p.flag !== "green") {
      alerts.push({ title: `${EMOJI[p.flag]} ${p.name}: ${label}`, tag: `rsv-${pid}`, body: `${p.why}.${starting ? " He is in your starting lineup." : ""}` });
    } else if (p.flag !== "green" && p.why !== was.why && /Practice:/.test(p.why)) {
      alerts.push({ title: `${EMOJI[p.flag]} ${p.name}: ${p.why}`, tag: `rsv-${pid}`, body: starting ? "He is in your starting lineup." : "He is on your bench." });
    }
  }
  const prevQ = new Set(prev.fa_qbs || []);
  for (const pid of cur.fa_qbs) {
    if (prevQ.has(pid)) continue;
    const q = cur.fa_qb_rows && cur.fa_qb_rows[pid];
    alerts.push({
      title: `QB on waivers: ${q ? q.name : pid}${q ? ` (${q.team})` : ""}`, tag: `rsv-faqb-${pid}`,
      body: "Starts for his NFL team and nobody in the league has him. Superflex priority claim — bid before Wednesday's waivers clear.",
    });
  }
  return alerts.slice(0, MAX_ALERTS);
}

/** Everything that changed since the last run, in words, for the advisor. */
export function changeReasons(prev, cur, sweep, alerts) {
  if (!prev) return [];
  const R = alerts.map(a => a.title);
  const had = new Set(Object.keys(prev.players)), has = new Set(Object.keys(cur.players));
  const added = [...has].filter(id => !had.has(id)).map(id => cur.players[id].name);
  const dropped = [...had].filter(id => !has.has(id)).map(id => prev.players[id].name);
  if (added.length || dropped.length) R.push(`Danny changed his roster: added ${added.join(", ") || "-"}, dropped ${dropped.join(", ") || "-"}`);
  else if (JSON.stringify(prev.starters || []) !== JSON.stringify(cur.starters)) R.push("Danny changed his starting lineup");
  const seen = new Set(prev.tx_seen || []);
  for (const t of sweep.transactions) {
    if (!t.id || seen.has(t.id) || t.team === MY_TEAM || t.status !== "complete") continue;
    const drops = t.dropped.map(d => `${d.name} (${d.pos} ${d.team}, proj ${d.proj}${d.fa ? ", now a free agent" : ""})`).join(", ");
    R.push(`League move: ${t.team} ${t.type}${t.bid != null ? ` (FAAB ${t.bid})` : ""} added ${t.adds.join(", ") || "-"}${drops ? `, dropped ${drops}` : ""}`);
  }
  return R;
}

export async function runCheck({ dry = false } = {}) {
  const sweep = await buildSweep({ force: true });
  const cur = snapshot(sweep);
  cur.fa_qb_rows = Object.fromEntries(sweep.fa_qbs.map(q => [q.id, { name: q.name, team: q.team }]));
  const prev = await kvGet("roster_state");
  const alerts = diffAlerts(prev, cur);
  const reasons = changeReasons(prev, cur, sweep, alerts);
  const sent = []; let advisor = null;
  if (!dry) {
    // a red flag on a starter goes out at once, whatever the advisor says
    for (const a of alerts.filter(a => a.critical)) sent.push({ title: a.title, results: await sendAll({ ...a, url: "./" }) });
    if (reasons.length) {
      try { advisor = await runAdvisor({ trigger: "change", reason: reasons.join("; "), sweep, push: true }); }
      catch (e) {
        advisor = { ok: false, error: String(e.message || e) };
        for (const a of alerts.filter(a => !a.critical)) sent.push({ title: a.title, results: await sendAll({ ...a, url: "./" }) });
      }
    }
    delete cur.fa_qb_rows;
    await kvSet("roster_state", cur);
    await kvSet("last_check", {
      ts: Date.now(), generated: sweep.generated, week: sweep.week, first_run: !prev, reasons,
      alerts: alerts.map(a => a.title), delivered: sent.reduce((n, s) => n + s.results.filter(r => r.ok).length, 0),
      advisor: advisor ? (advisor.ok ? { headline: advisor.advice.headline, pushed: advisor.sent.map(s => `${s.key} (${s.delivered} delivered)`) } : { error: advisor.error }) : null,
    });
  }
  return { ok: true, dry, first_run: !prev, week: sweep.week, generated: sweep.generated, alerts, reasons, sent, advisor: advisor && (advisor.ok ? { headline: advisor.advice.headline, pushed: advisor.sent } : advisor) };
}
