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
 "adds": [{"add": "name", "pos": "RB", "team": "NFL team", "drop": "name on Danny's roster, or null when an IR move frees the spot first", "how": "add now|waiver claim", "bid": 0, "backup": false, "processes": "when the claim processes (from the data), or null for a free agent", "why": "one sentence", "evidence": "the dated facts you verified for the add AND the drop, including the status of whoever is ahead of each on his NFL depth chart", "urgency": "high|medium|low"}],
 "ir": [{"player": "name on Danny's roster", "move": "to IR|off IR", "why": "one sentence", "urgency": "high|medium|low"}],
 "flags": [{"player": "name on Danny's roster", "severity": "red|amber|green", "what": "status in a few words, with the date of the news"}],
 "watch": [{"player": "name", "what": "what to watch for and when"}],
 "alerts": [{"key": "stable-id-for-this-situation", "urgency": "high|medium|low", "title": "under 50 characters, starting with 🔴 🟡 🟢 (a player's status), 🔁 (a lineup change) or ➕ (an add)", "body": "one or two sentences: what happened and exactly what to do, with the deadline"}]}
Field rules. "evidence" is mandatory on every lineup and add item and must come from what you checked today (the room shown in the data, plus a search dated within 5 days); an item whose drop or sit is justified only by memory of last season's depth chart is wrong and must not be output. "lineup" lists only changes to Danny's CURRENT starting lineup between players he already rosters (an empty array when it is already right); never move a locked player. A DEF or K stream that brings in a free agent is an add (how "add now", bid 0, drop the old unit), not a lineup item. "ir" lists IR moves: eligible players to put on IR (frees a bench spot) and any player who must come off IR; if the player is LOCKED this week the move can only happen Tuesday morning, so say that in "why" and do not pretend the spot is free before then. "adds" lists only adds worth making now, best first, at most 4, each naming the drop (an unlocked player) or null only when an IR move has already freed the spot; "how" is "add now" for a player the data shows as a free agent right now (then "bid" is 0 and "processes" null) and "waiver claim" for a player the data shows on waivers (then "bid" is an odd whole number, at least the minimum bid and at most Danny's remaining FAAB, sized by the playbook against the rivals' budgets, and "processes" is the time the data gives for that player). "backup": true marks a fallback claim that names the SAME drop as the claim above it and only lands if that one loses; the bids of all non-backup claims together must fit in Danny's remaining FAAB and must respect the season plan (at least 90 stays untouched until a league-winner appears; a player who would sit on Danny's bench is at most 3). Say the bid and its tier in "why", e.g. "tier 3, bid 5 of your 150". FAAB is a notional budget, never call it money. "flags" covers every player on Danny's roster who is not simply healthy and starting. "alerts" is what deserves a phone notification: a lineup change he must make, a claim he must place, a player another team just dropped that he should grab, or a material status change on one of his players. Urgency high = act before the next kickoff or today; medium = this week; low = FYI only, not pushed. Use the same key every time the same situation is reported so he is not told twice, and build it from the action itself so a changed action is a new key: an add is "add:<player>-for-<drop>-wk<N>", a lineup change is "lineup:<start>-over-<sit>-wk<N>", an IR move is "ir:<player>-wk<N>", a status note is "flag:<player>-<status>-wk<N>". A new development or a different drop/sit gets a new key. When nothing warrants a push, "alerts" is an empty array.`;

// how a free agent can be had: "claim_at" is only set on rows the sweep checked for availability
const av = r => !("claim_at" in r) ? "" : r.waivers ? ` · ${r.waivers}` : " · free agent right now, add with no bid";
const row = r => `${r.pos} ${r.name} (${r.team})${r.flag !== "green" ? ` [${r.flag.toUpperCase()}: ${r.why}]` : ""} · proj ${r.proj ?? "?"} · ${r.game || "?"}${r.locked ? " · LOCKED" : ""}${r.bye ? ` · bye ${r.bye}` : ""}${av(r)}${r.room ? ` · room: ${r.room}` : ""}`;

/** The situation, as text for Claude. */
export function contextText(sweep, { news = "", prev = null, notified = {}, reason = "" } = {}) {
  const L = [];
  L.push(`Now: ${nowPT()}. NFL week ${sweep.week}. Danny's record ${sweep.record}. FAAB ${sweep.faab_left ?? "?"} of ${sweep.faab_total ?? "?"} left (notional budget, minimum bid ${sweep.faab_min_bid ?? 1}); waiver priority ${sweep.waiver_position || "?"} of 12 (breaks tied bids only). Next weekly waiver run: ${sweep.waiver_run || "Wednesday 12:05 AM PT"}; claims on players who played this week process then, and a claim on a player another team dropped processes 48 hours after the drop. Sleeper data as of ${sweep.generated}.`);
  if (sweep.faab_teams && sweep.faab_teams.length) L.push(`FAAB left by team, in waiver-priority order: ` + sweep.faab_teams.map(t => `${t.team} ${t.left}${t.team === "Robinsavages" ? " (Danny)" : ""}`).join(", "));
  const locked = sweep.roster.filter(r => r.locked).map(r => `${r.name} (${r.game})`);
  L.push(`Locked this week (game played or in progress; cannot be benched, dropped or moved to IR until the week's games are complete on Tuesday morning): ${locked.join(", ") || "nobody yet"}.`);
  L.push(`Danny's roster (slot · player · Sleeper flag · projected points this week under this league's scoring · game):`);
  for (const r of sweep.roster) L.push(`  ${r.slot.padEnd(5)} ${row(r)}`);
  const lu = sweep.lineup;
  if (lu) {
    L.push(`Current starting lineup projects to ${lu.current_pts} points: ` + lu.current.map(c => `${c.slot} ${c.name || "EMPTY"} ${c.proj}`).join(", "));
    L.push(`Best lineup by projection alone: ${lu.optimal_pts} points` + (lu.start.length || lu.sit.length ? ` (start ${lu.start.join(", ") || "-"}; sit ${lu.sit.join(", ") || "-"})` : " (same as current)") + ". Projections do not know today's news; you do.");
  }
  if (sweep.byes) L.push(`Bye weeks ahead for Danny's active players (this is week ${sweep.week}): ` + (sweep.byes.length ? sweep.byes.map(b => `week ${b.week}: ${b.players.join(", ")}${b.qbs >= 2 ? " — TWO OR MORE OF HIS QBS THAT WEEK, a superflex hole to fix at least two weeks ahead with a QB whose bye differs" : ""}`).join("; ") : "none in the next 5 weeks") + `. His QBs' byes: ${(sweep.qb_byes || []).join(", ")}.`);
  const d = sweep.def;
  if (d) L.push(`DEF (Danny streams by matchup): he has ${d.mine ? `${d.mine.name} (proj ${d.mine.proj} this week, ${d.mine.game}; week ${sweep.next_week} proj ${d.mine.next.proj}, ${d.mine.next.game}${d.mine.bye ? `; bye ${d.mine.bye}` : ""})` : "no DEF"}. Best free-agent DEF this week: ${d.fa_this.map(x => `${x.name} ${x.proj} (${x.game}${x.waivers ? ", on waivers" : ""})`).join("; ") || "none"}. Best free-agent DEF for week ${sweep.next_week}: ${d.fa_next.map(x => `${x.name} ${x.proj} (${x.game})`).join("; ") || "no projections yet"}.`);
  if (sweep.ir) L.push(`IR: ${sweep.ir.slots} slots, ${sweep.ir.used} used. Designations that qualify here: ${sweep.ir.allowed.join(", ")}. Danny's players eligible for IR right now: ${sweep.ir.eligible.join(", ") || "none"}.${sweep.ir.healthy_on_ir.length ? ` MUST come off IR (no longer eligible): ${sweep.ir.healthy_on_ir.join(", ")}.` : ""}`);
  const o = sweep.opponent;
  if (o && o.team) L.push(`This week's opponent: ${o.team} (${o.record}), starters project ${o.proj_pts}: ` + o.starters.map(row).join("; "));
  L.push(`Free-agent QBs who start for their NFL team (nobody in this league has them): ` + (sweep.fa_qbs.length ? sweep.fa_qbs.map(row).join("; ") : "none"));
  if (sweep.fa_top) {
    L.push(`Best free agents in THIS league by projection this week:`);
    for (const [pos, rows] of Object.entries(sweep.fa_top)) if (rows.length) L.push(`  ${pos}: ` + rows.map(r => `${r.name} (${r.team}, proj ${r.proj}, ${r.game}${r.flag !== "green" ? `, ${r.flag}: ${r.why}` : ""}${av(r)}${r.room ? `; room: ${r.room}` : ""})`).join("; "));
  }
  if (sweep.trending.length) L.push(`Trending adds across Sleeper in the last 48h that are free agents here: ` + sweep.trending.map(r => `${r.pos} ${r.name} (${r.team}, ${r.adds} adds, proj ${r.proj}${r.flag !== "green" ? `, ${r.flag}: ${r.why}` : ""}${av(r)}${r.room ? `; room: ${r.room}` : ""})`).join("; "));
  const recent = sweep.transactions.filter(t => t.ts && Date.now() - t.ts < 4 * 24 * H);
  if (recent.length) L.push(`League transactions in the last 4 days (newest first; a bid is what the winner paid): ` + recent.map(t => `${fmt(t.ts)} ${t.team} ${t.type}${t.bid != null ? ` (bid ${t.bid})` : ""}${t.status !== "complete" ? ` [${t.status}${t.note ? `: ${t.note}` : ""}]` : ""}${(t.faab_moved || []).length ? ` (FAAB moved: ${t.faab_moved.map(m => `${m.amount} ${m.from} to ${m.to}`).join(", ")})` : ""}: added ${t.adds.join("/") || "-"}, dropped ${t.dropped.length ? t.dropped.map(d => `${d.name} (${d.pos} ${d.team}, proj ${d.proj}${d.fa ? `, STILL UNOWNED${av(d)}` : ", since claimed"})`).join("/") : (t.drops.join("/") || "-")}`).join("; "));
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
    system: `${RULES}\n\n${SCHEMA}` + (withSearch ? `\n\nYou have a web_search tool. Research order, one focused search each, before you write anything: (1) Danny's amber and red players; (2) every player you intend to name in a lineup change or an add/drop, BOTH sides of each swap, searching "<name> <NFL team> news" for role, injury, suspension or exempt-list status and the status of whoever is ahead of him on the depth chart; (3) any bench player whose room shows him as his team's #1 while his projection is low, because that projection is stale; (4) every player another team dropped in the last 4 days who is still unowned: why he was dropped and whether he beats Danny's worst bench player (say so in "watch" when he does not); (5) when two of Danny's QBs share a bye in the next 5 weeks, the best free-agent QB whose bye differs. If a search contradicts the room shown in the data, prefer the newer, dated source and say so. Mention the date of the news you rely on. Do not include URLs. Only give advice you have checked this way; if you ran out of searches before checking a swap, leave that swap out and put the player in "watch" instead.` : ""),
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
    lineup: arr("lineup"), ir: arr("ir"), adds: arr("adds"), flags: arr("flags"), watch: arr("watch"), alerts: arr("alerts"),
    projections: sweep.lineup ? { current: sweep.lineup.current_pts, optimal: sweep.lineup.optimal_pts, start: sweep.lineup.start, sit: sweep.lineup.sit } : null,
    faab_left: sweep.faab_left ?? null, faab_total: sweep.faab_total ?? null, waiver_run: sweep.waiver_run || null,
    model: res.model, searches: res.searches, fallback: res.fallback || null, usage: res.usage && { in: res.usage.input_tokens, out: res.usage.output_tokens, cached: res.usage.cache_read_input_tokens, cache_write: res.usage.cache_creation_input_tokens },
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
