// Sleeper client for the Vercel functions. Mirrors scripts/sweep.py: same flags, same shapes.
// Public API, no auth. Players feed is ~2.5 MB gzipped, so it is cached in module memory for 10 min.
const API = "https://api.sleeper.app/v1";
export const LEAGUE = "1312551337698820096";
export const ME = "1263724329326100480"; // dannyrobinson
export const MY_ROSTER_ID = 6;
const POS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
const ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };
const RED_INJ = new Set(["out", "ir", "pup", "sus", "nfi", "cov", "doubtful", "dnr"]);
const RED_STATUS = new Set(["Injured Reserve", "Inactive", "Suspended", "PUP", "Physically Unable to Perform",
  "Non Football Injury", "Reserve/COVID-19", "Practice Squad"]);
const TZ = "America/Vancouver";
import { optimalLineup } from "./lineup.js";
import { gamesFor } from "./games.js";

export async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: { "user-agent": "robinsavages-gm/1.0" } });
  if (!r.ok) throw new Error(`Sleeper ${path} -> ${r.status}`);
  return r.json();
}
// undocumented but public endpoints Sleeper's own app uses (no /v1 prefix)
async function getRaw(path) {
  const r = await fetch(`https://api.sleeper.app/${path}`, { headers: { "user-agent": "robinsavages-gm/1.0" } });
  if (!r.ok) throw new Error(`Sleeper ${path} -> ${r.status}`);
  return r.json();
}
const WEEKDAY = d => d ? new Date(`${d}T12:00:00-07:00`).toLocaleDateString("en-US", { weekday: "short", timeZone: TZ }) : null;

/** This week's projected points per player under THIS league's scoring (PPR, +0.5/rec for TE). */
export async function projections(season, week, positions = ["QB", "RB", "WR", "TE", "K", "DEF"]) {
  const pos = positions.map(p => `position[]=${p}`).join("&");
  const rows = await getRaw(`projections/nfl/${season}/${week}?season_type=regular&${pos}`);
  const out = {};
  for (const r of rows) {
    const st = r.stats || {}; if (st.pts_ppr == null) continue;
    const pos = r.player && r.player.position;
    const pts = st.pts_ppr + (pos === "TE" ? 0.5 * (st.rec || 0) : 0);
    const r1 = x => x == null ? null : Math.round(x * 10) / 10;
    out[r.player_id] = { proj: Math.round(pts * 10) / 10, opp: r.opponent || null, date: r.date || null,
      tgt: r1(st.rec_tgt), att: r1(st.rush_att), pa: r1(st.pass_att) };   // projected volume (targets, carries, pass attempts)
  }
  return out;
}
let gamesCache = { season: null, ts: 0, games: null };
async function seasonGames(season) {
  if (gamesCache.games && gamesCache.season === season && Date.now() - gamesCache.ts < 10 * 60 * 1000) return gamesCache.games;
  const games = await getRaw(`schedule/nfl/regular/${season}`);
  gamesCache = { season, ts: Date.now(), games };
  return games;
}
/** team -> bye week: the regular-season week with no game for that team. */
export async function byeWeeks(season) {
  const games = await seasonGames(season);
  const weeks = {}, teams = new Set();
  for (const g of games) { (weeks[g.week] ||= new Set()).add(g.home).add(g.away); teams.add(g.home); teams.add(g.away); }
  const byes = {};
  for (const [w, played] of Object.entries(weeks)) for (const t of teams) if (!played.has(t)) byes[t] = Number(w);
  return byes;
}
/** team -> {date, day, opp, home, status} for the week. */
export async function schedule(season, week) {
  const games = await seasonGames(season);
  const out = {};
  for (const g of games) {
    if (Number(g.week) !== Number(week)) continue;
    out[g.home] = { date: g.date, day: WEEKDAY(g.date), opp: g.away, home: true, status: g.status };
    out[g.away] = { date: g.date, day: WEEKDAY(g.date), opp: g.home, home: false, status: g.status };
  }
  return out;
}
export function gameText(g, env) {   // env: the team's entry from lib/games.js, when we have it (adds the kickoff in PT)
  if (!g) return "bye";
  const when = g.status === "complete" ? "played" : g.status === "in_progress" ? "IN PROGRESS" : env && env.kick_pt && env.status === "pre_game" ? env.kick_pt : g.day;
  return `${when} ${g.home ? "vs" : "@"} ${g.opp}`;
}
/** Projected volume as text: what the playbook's usage rules key on. */
export function volText(pr) {
  if (!pr) return null;
  const v = [];
  if (pr.pa) v.push(`${pr.pa} pass att`);
  if (pr.att) v.push(`${pr.att} carries`);
  if (pr.tgt) v.push(`${pr.tgt} targets`);
  return v.length ? v.join(", ") : null;
}

let playersCache = { ts: 0, map: null };
const PLAYERS_TTL = 10 * 60 * 1000;
export async function players(force = false) {
  if (!force && playersCache.map && Date.now() - playersCache.ts < PLAYERS_TTL) return playersCache.map;
  const raw = await get("players/nfl");
  const map = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!POS.has(v.position)) continue;
    map[k] = {
      name: v.full_name || `${v.first_name || ""} ${v.last_name || ""}`.trim(), pos: v.position, team: v.team || null,
      injury_status: v.injury_status || null, injury_body_part: v.injury_body_part || null, injury_notes: v.injury_notes || null,
      practice_participation: v.practice_participation || null, depth_chart_position: v.depth_chart_position || null,
      depth_chart_order: v.depth_chart_order || null, status: v.status || null, news_updated: v.news_updated || null,
      search_rank: v.search_rank || null,
    };
  }
  playersCache = { ts: Date.now(), map };
  return map;
}

let leagueCache = null;
async function leagueInfo() {
  if (leagueCache) return leagueCache;
  const lg = await get(`league/${LEAGUE}`);
  const st = lg.settings || {};
  leagueCache = {
    trade_deadline: st.trade_deadline, playoff_week_start: st.playoff_week_start, playoff_teams: st.playoff_teams,
    regular_weeks: (st.playoff_week_start || 15) - 1, two_week_rounds: st.playoff_round_type === 2, name: lg.name,
    roster_positions: lg.roster_positions || null,
    reserve_slots: st.reserve_slots || 0,
    // waivers: FAAB (waiver_type 2) with a season budget and a minimum bid; the weekly run is what Sleeper calls
    // "Tue After Day" = 12:05 AM PT Wednesday (waiver_day_of_week 2, daily_waivers_hour 0)
    waiver_type: st.waiver_type ?? null, faab_budget: st.waiver_budget || 0, faab_min_bid: st.waiver_bid_min ?? 0,
    waiver_clear_days: st.waiver_clear_days ?? 2, faab_suggestions: !!st.faab_suggestions,
    reserve_allow: ["IR", ...(st.reserve_allow_out ? ["Out"] : []), ...(st.reserve_allow_doubtful ? ["Doubtful"] : []), ...(st.reserve_allow_sus ? ["Sus"] : []),
      ...(st.reserve_allow_na ? ["NA"] : []), ...(st.reserve_allow_dnr ? ["DNR"] : []), ...(st.reserve_allow_cov ? ["COV"] : []), "PUP", "NFI"],
    // Player AutoSubs (Sleeper, since 2024): a bench player designated to replace a starter who is inactive at
    // kickoff. max_subs = swaps a team may use per week (0 = off); sub_start_time_eligibility = the "Require AutoSub
    // To Not Play Before Starter" toggle; sub_lock_if_starter_active = the sub stays locked even when the starter
    // plays (off = Sleeper's Sept 2024 behaviour, the sub is released). Both players lock INTO the pair the moment
    // EITHER game kicks off; the swap itself fires at the starter's kickoff if he is inactive, and with the start-time
    // toggle off a sub whose game is already over still goes in and his points count (Sleeper added the toggle
    // because some leagues objected to exactly that). Which subs a manager has set is NOT in the public API (authenticated
    // GraphQL matchup_legs.subs), so the app records Danny's note in kv "subs" and the advisor reads that.
    auto_subs: { max: st.max_subs || 0, any_start_time: !st.sub_start_time_eligibility, sub_freed_if_starter_plays: !st.sub_lock_if_starter_active },
  };
  return leagueCache;
}

export function flag(p) {
  const inj = (p.injury_status || "").toLowerCase();
  const st = p.status || "";
  const prac = p.practice_participation || "";
  const depth = p.depth_chart_order;
  const detail = [p.injury_status, p.injury_body_part, p.injury_notes].filter(Boolean).join(" · ");
  if (!p.team) return ["red", "Free agent / no team"];
  if (RED_INJ.has(inj) || RED_STATUS.has(st)) return ["red", detail || st];
  if (p.pos === "QB" && depth && depth >= 2) return ["red", `Not the starter (QB${depth})` + (detail ? ` · ${detail}` : "")];
  if (inj === "questionable") return ["amber", detail];
  if (["limited", "dnp", "did not practice"].includes(prac.toLowerCase())) return ["amber", `Practice: ${prac}` + (detail ? ` · ${detail}` : "")];
  if (p.pos === "RB" && depth && depth >= 2) return ["amber", `RB${depth} on the depth chart`];
  if ((p.pos === "WR" || p.pos === "TE") && depth && depth >= 3) return ["amber", `${p.pos}${depth} on the depth chart`];
  if (inj) return ["amber", detail];
  return ["green", "Healthy, starting"];
}

const tsDate = ms => ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ }) : null;

/** The position room on a player's NFL team, by depth chart: "Lloyd RB1 · Brooks RB2 · K.Johnson RB3 · Jacobs RB4 (NA · Personal = exempt list/away)". */
const tag = p => {
  const inj = p.injury_status;
  if (inj === "NA") return `NA${p.injury_body_part ? ` · ${p.injury_body_part}` : ""} = exempt list/away from team`;
  if (RED_STATUS.has(p.status || "")) return p.status;
  if (inj) return inj + (p.injury_body_part ? ` · ${p.injury_body_part}` : "");
  return null;
};
export function roomOf(pid, P) {
  const me = P[pid]; if (!me || !me.team || !["QB", "RB", "WR", "TE"].includes(me.pos)) return null;
  const mates = Object.entries(P).filter(([, p]) => p.team === me.team && p.pos === me.pos && p.status !== "Practice Squad")
    .sort((a, b) => (a[1].depth_chart_order || 99) - (b[1].depth_chart_order || 99) || (a[1].search_rank || 9999) - (b[1].search_rank || 9999))
    .slice(0, 5);
  return mates.map(([id, p]) => {
    const short = p.name.replace(/^(\w)\S* /, "$1. ");
    const t = tag(p);
    return `${id === pid ? "**" : ""}${short}${id === pid ? "**" : ""} ${p.depth_chart_position && p.depth_chart_order ? `${p.pos}${p.depth_chart_order}` : "no depth slot"}${t ? ` (${t})` : ""}`;
  }).join(" · ");
}

export function playerRow(pid, P) {
  const p = P[pid] || { name: pid, pos: "?", team: null };
  const [colour, why] = flag(p);
  return {
    id: pid, name: p.name, pos: p.pos, team: p.team || "FA", flag: colour, why, injury: p.injury_status || null,
    depth: `${p.depth_chart_position || ""}${p.depth_chart_order || ""}` || null,
    news: tsDate(p.news_updated), news_ms: p.news_updated || null,
  };
}

export const fmtPT = ms => new Date(ms).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday in PT and minutes since midnight PT. */
export function clockPT(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: TZ }).formatToParts(now).map(x => [x.type, x.value]));
  return { dow: p.weekday, mins: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
/** Sleeper's weekly waiver run for this league ("Tue After Day"): 12:05 AM PT on Wednesday. */
export function nextWaiverRun(now = new Date()) {
  const { dow, mins } = clockPT(now);
  let days = (3 - DOW.indexOf(dow) + 7) % 7;
  if (days === 0 && mins >= 5) days = 7;
  const ts = now.getTime() + ((days * 24 * 60 + 5) - mins) * 60 * 1000;   // a DST switch can shift this by an hour; close enough
  return { ts, text: fmtPT(ts) };
}

export function nowPT() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ,
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${parts.weekday} ${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod} PT`;
}

/** The same object scripts/sweep.py writes to data/sweep.json, built live. */
export async function buildSweep({ force = false } = {}) {
  const st = await get("state/nfl");
  const week = Number(st.leg || st.week || 1);
  const [P, rosters, usersRaw, trendRaw, txRaw, mus, league, PROJ, SCHED, txPrev] = await Promise.all([
    players(force), get(`league/${LEAGUE}/rosters`), get(`league/${LEAGUE}/users`),
    get("players/nfl/trending/add?lookback_hours=48&limit=60"), get(`league/${LEAGUE}/transactions/${week}`),
    get(`league/${LEAGUE}/matchups/${week}`).catch(e => ({ error: String(e.message || e) })), leagueInfo(),
    projections(st.season, week).catch(() => ({})), schedule(st.season, week).catch(() => ({})),
    week > 1 ? get(`league/${LEAGUE}/transactions/${week - 1}`).catch(() => []) : [],   // last week's drops may still be clearing
  ]);
  // bye weeks, next week's DEF picture for streaming (projections + schedule for week+1), and the game
  // environment for both weeks (kickoff times, Vegas lines, roof, wind) from lib/games.js
  const envErrors = [];   // a failed schedule/ESPN/Open-Meteo fetch leaves the environment fields null and is reported as env_error
  const envOf = w => gamesFor(st.season, w).then(g => { for (const e of g._errors || []) envErrors.push(`week ${w} ${e}`); return g; })
    .catch(e => { envErrors.push(`week ${w}: ${e && e.message || e}`); console.error("games", w, e); return {}; });
  const [BYES, PROJN, SCHEDN, GAMES, GAMESN] = await Promise.all([
    byeWeeks(st.season).catch(() => ({})), projections(st.season, week + 1, ["DEF"]).catch(() => ({})), schedule(st.season, week + 1).catch(() => ({})),
    envOf(week), envOf(week + 1),
  ]);
  // Sleeper's own rank within the position (its search order) for K and DEF, where weekly projections are flat and
  // the consensus view of the unit is the better guide: a top-5 unit is held, not streamed away for a point.
  const posRank = {};
  for (const pos of ["K", "DEF"]) {
    Object.entries(P).filter(([, p]) => p.pos === pos && p.team && p.status !== "Inactive" && p.search_rank)
      .sort((a, b) => a[1].search_rank - b[1].search_rank).forEach(([pid], i) => { posRank[pid] = i + 1; });
  }
  const enrich = row => {   // projected points + volume + game (with kickoff, line, weather) + bye for any player row
    const pr = PROJ[row.id]; const p = P[row.id];
    row.proj = pr ? pr.proj : 0;
    row.vol = volText(pr);
    row.rank = posRank[row.id] || null;
    const g = SCHED[p && p.team]; const env = GAMES[p && p.team];
    row.game = gameText(g, env); row.locked = !!(g && g.status !== "pre_game"); row.date = g ? g.date : null;
    if (env) {
      row.kick_ms = env.kick_ms; row.kick_pt = env.kick_pt; row.window = env.window;
      row.line = env.line; row.env = env.env; row.spread = env.spread; row.implied = env.implied; row.opp_implied = env.opp_implied;
      row.wind = env.weather ? env.weather.wind : null;
    }
    row.bye = (p && BYES[p.team]) || null;
    row.room = roomOf(row.id, P);
    return row;
  };
  // Availability of a free agent (FAAB league). Sleeper locks a free agent at kickoff and keeps him on waivers
  // until the weekly run (12:05 AM PT Wednesday); on Tuesday the NFL week has already rolled over, so everyone
  // who played is still on waivers. A dropped player sits on waivers waiver_clear_days and the claims on him
  // process exactly then, whatever the hour (verified against the 2025 league's transactions).
  const run = nextWaiverRun();
  const tuesday = clockPT().dow === "Tue";
  const droppedAt = {};
  for (const t of [...txRaw, ...txPrev]) if (t.status === "complete") for (const pid of Object.keys(t.drops || {})) droppedAt[pid] = Math.max(droppedAt[pid] || 0, t.status_updated || t.created || 0);
  const avail = row => {
    const clears = droppedAt[row.id] ? droppedAt[row.id] + (league.waiver_clear_days ?? 2) * 24 * 3600 * 1000 : 0;
    const weekly = (row.locked || tuesday) ? run.ts : 0;
    const at = Math.max(clears > Date.now() ? clears : 0, weekly);
    row.claim_at = at || null;
    row.waivers = !at ? null : clears >= weekly ? `on waivers (dropped ${fmtPT(droppedAt[row.id])}); claims on him process ${fmtPT(clears)}` : `on waivers until the weekly run ${run.text}`;
    return row;
  };
  const users = Object.fromEntries(usersRaw.map(u => [u.user_id, (u.metadata && u.metadata.team_name) || u.display_name]));
  const teamOf = Object.fromEntries(rosters.map(r => [r.roster_id, users[r.owner_id] || `roster ${r.roster_id}`]));
  const taken = {};
  for (const r of rosters) for (const pid of (r.players || [])) taken[pid] = r.roster_id;
  const mine = rosters.find(r => r.owner_id === ME);
  if (!mine) throw new Error("my roster not found in league");
  const starters = (mine.starters || []).filter(p => p && p !== "0");
  const reserve = mine.reserve || [];
  const settings = mine.settings || {};

  const roster = (mine.players || []).map(pid => {
    const row = enrich(playerRow(pid, P));
    row.slot = reserve.includes(pid) ? "IR" : starters.includes(pid) ? "START" : "BN";
    return row;
  }).sort((a, b) => (ORDER[a.pos] ?? 9) - (ORDER[b.pos] ?? 9) || a.name.localeCompare(b.name));

  // current lineup (Sleeper's starters array follows the league's roster_positions) vs the best by projection
  const slotNames = (league.roster_positions || []).filter(s => s !== "BN" && s !== "IR");
  const byId = Object.fromEntries(roster.map(r => [r.id, r]));
  const current = (mine.starters || []).map((pid, i) => ({ slot: slotNames[i] || "?", player: byId[pid] || null }));
  const currentPts = Math.round(current.reduce((n, c) => n + ((c.player && c.player.proj) || 0), 0) * 10) / 10;
  const fixed = current.filter(c => c.player && c.player.locked);
  const fixedIds = new Set(fixed.map(c => c.player.id));
  const canStart = roster.filter(r => r.slot !== "IR" && !fixedIds.has(r.id) && !r.locked && r.flag !== "red" && !["doubtful", "out"].includes((r.injury || "").toLowerCase()));
  const openSlots = current.filter(c => !(c.player && c.player.locked)).map(c => c.slot);
  const solved = optimalLineup(canStart, openSlots.length ? openSlots : (slotNames.length ? slotNames : undefined));
  const opt = { slots: [], pts: Math.round((solved.pts + fixed.reduce((n, c) => n + (c.player.proj || 0), 0)) * 10) / 10 };
  let k = 0;
  for (const c of current) opt.slots.push(c.player && c.player.locked ? { slot: c.slot, player: c.player } : solved.slots[k++] || { slot: c.slot, player: null });
  const curIds = new Set(current.map(c => c.player && c.player.id).filter(Boolean));
  const optIds = new Set(opt.slots.map(c => c.player && c.player.id).filter(Boolean));
  const allow = new Set((league.reserve_allow || []).map(x => x.toLowerCase()));
  const ir = {
    slots: league.reserve_slots || 0, used: roster.filter(r => r.slot === "IR").length,
    allowed: league.reserve_allow || [],
    eligible: roster.filter(r => r.slot !== "IR" && allow.has((r.injury || "").toLowerCase())).map(r => `${r.name} (${r.injury})`),
    healthy_on_ir: roster.filter(r => r.slot === "IR" && !allow.has((r.injury || "").toLowerCase())).map(r => r.name),
  };
  const lineup = {
    current: current.map(c => ({ slot: c.slot, id: c.player && c.player.id, name: c.player && c.player.name, pos: c.player && c.player.pos, proj: c.player ? c.player.proj : 0 })),
    current_pts: currentPts,
    optimal: opt.slots.map(c => ({ slot: c.slot, id: c.player && c.player.id, name: c.player && c.player.name, pos: c.player && c.player.pos, proj: c.player ? c.player.proj : 0 })),
    optimal_pts: opt.pts,
    start: roster.filter(r => optIds.has(r.id) && !curIds.has(r.id)).map(r => r.name),
    sit: roster.filter(r => curIds.has(r.id) && !optIds.has(r.id)).map(r => r.name),
  };

  // Auto-sub candidates: for each starter who might not play (Questionable, or a practice flag, and not locked) the
  // bench players who could be his Sleeper AutoSub: unlocked, allowed in his slot, not on bye. Sleeper locks both
  // players INTO the pair when EITHER game kicks off (it can no longer be changed), and swaps the sub in at the
  // starter's kickoff if he is inactive, even when the sub's own game is already over (unless the league requires
  // same-or-later kickoffs). Kickoff times come from lib/games.js; when they are missing we fall back to the day.
  const eligFor = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"], FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"] };
  const bench = roster.filter(r => r.slot === "BN" && !r.locked && r.flag !== "red" && r.game !== "bye");
  // Sleeper fires the swap at the STARTER's kickoff if he is inactive. Unless the league requires the sub to play at
  // the same time or later ("Require AutoSub To Not Play Before Starter"), a sub whose game kicked off earlier, even
  // one already over, still goes in and his points count; the pair just has to be set before the earlier kickoff.
  const anyStart = !league.auto_subs || league.auto_subs.any_start_time;
  const timing = (s, st) => {
    if (s.kick_ms && st.kick_ms) {
      if (s.kick_ms > st.kick_ms) return `kicks off later (${s.kick_pt}; starter ${st.kick_pt}): set the pair before ${st.kick_pt}`;
      if (s.kick_ms === st.kick_ms) return `same kickoff (${s.kick_pt}): set the pair before then`;
      return anyStart ? `kicks off earlier (${s.kick_pt}; starter ${st.kick_pt}): allowed here and full cover even after his game, set the pair before ${s.kick_pt}`
        : `kicks off EARLIER (${s.kick_pt}; starter ${st.kick_pt}): NOT eligible, this league requires the sub to play at the same time or later`;
    }
    return !s.date || !st.date ? "day unknown" : s.date > st.date ? "later day" : s.date === st.date ? "same day (kickoff unknown)"
      : anyStart ? "earlier day: allowed here and full cover, set the pair before his kickoff" : "EARLIER day: NOT eligible in this league";
  };
  const at_risk = current.filter(c => c.player && !c.player.locked && c.player.flag === "amber" && (c.player.injury || /Practice/.test(c.player.why || ""))).map(c => ({
    starter: c.player.name, id: c.player.id, slot: c.slot, status: c.player.injury || c.player.why, proj: c.player.proj, game: c.player.game, date: c.player.date, window: c.player.window || null,
    subs: bench.filter(b => (eligFor[c.slot] || []).includes(b.pos)).map(b => ({ name: b.name, pos: b.pos, proj: b.proj, game: b.game, date: b.date, window: b.window || null, timing: timing(b, c.player) })).sort((a, b) => b.proj - a.proj),
  }));
  const auto_subs = { ...(league.auto_subs || { max: 0 }), at_risk };

  const fa_qbs = Object.entries(P)
    .filter(([pid, p]) => p.pos === "QB" && p.team && !taken[pid] && p.depth_chart_order === 1 && p.status === "Active")
    .map(([pid]) => avail(enrich(playerRow(pid, P))))
    .sort((a, b) => (P[a.id].search_rank || 9999) - (P[b.id].search_rank || 9999));

  // best free agents in THIS league by this week's projection, per position
  const fa_top = {};
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"]) {
    fa_top[pos] = Object.entries(PROJ)
      .filter(([pid, pr]) => pr.proj > 0 && !taken[pid] && P[pid] && P[pid].pos === pos && P[pid].team && (pos === "DEF" || P[pid].status === "Active"))
      .sort((a, b) => b[1].proj - a[1].proj).slice(0, pos === "K" || pos === "DEF" ? 3 : 6)
      .map(([pid]) => avail(enrich(playerRow(pid, P))));
  }

  const trending = [];
  for (const t of trendRaw) {
    const pid = t.player_id, p = P[pid];
    if (!p || taken[pid]) continue;
    const row = avail(enrich(playerRow(pid, P))); row.adds = t.count;
    if (row.flag === "red" && ["ir", "out", "sus", "pup", "nfi"].includes((p.injury_status || "").toLowerCase())) continue;
    trending.push(row);
  }
  trending.sort((a, b) => ((a.pos === "K" || a.pos === "DEF") - (b.pos === "K" || b.pos === "DEF")) || b.adds - a.adds);

  const transactions = txRaw.map(t => ({
    id: t.transaction_id, type: t.type, status: t.status, team: teamOf[(t.roster_ids || [])[0]] || "?",
    adds: Object.keys(t.adds || {}).map(p => (P[p] || {}).name || p), drops: Object.keys(t.drops || {}).map(p => (P[p] || {}).name || p),
    // who was let go, and whether he is still a free agent here (worth a look if his projection is real)
    dropped: Object.keys(t.drops || {}).filter(p => P[p]).map(p => { const r = enrich(playerRow(p, P)); r.fa = !taken[p]; if (r.fa) avail(r); return r; }),
    bid: (t.settings || {}).waiver_bid ?? null, note: (t.metadata || {}).notes || null,   // Sleeper's note on a failed claim
    faab_moved: (t.waiver_budget || []).map(b => ({ from: teamOf[b.sender] || `roster ${b.sender}`, to: teamOf[b.receiver] || `roster ${b.receiver}`, amount: b.amount })),
    ts: t.status_updated || t.created,
  })).sort((a, b) => (b.ts || 0) - (a.ts || 0));

  let opponent = null;
  if (Array.isArray(mus)) {
    const me = mus.find(m => m.roster_id === MY_ROSTER_ID);
    const o = me && mus.find(m => m.matchup_id === me.matchup_id && m.roster_id !== MY_ROSTER_ID);
    if (o) {
      const orost = rosters.find(r => r.roster_id === o.roster_id) || {};
      const oset = orost.settings || {};
      opponent = {
        team: teamOf[o.roster_id], roster_id: o.roster_id,
        record: `${oset.wins || 0}-${oset.losses || 0}` + (oset.ties ? `-${oset.ties}` : ""),
        starters: (o.starters || []).filter(p => p && p !== "0").map(p => enrich(playerRow(p, P))),
        my_points: me.points, their_points: o.points,
      };
      opponent.proj_pts = Math.round(opponent.starters.reduce((n, r) => n + (r.proj || 0), 0) * 10) / 10;
    }
  } else if (mus && mus.error) opponent = { error: mus.error };

  const qb_depth = rosters.map(r => {
    const qbs = (r.players || []).filter(p => (P[p] || {}).pos === "QB").map(p => P[p].name);
    const s = r.settings || {};
    return { team: teamOf[r.roster_id], roster_id: r.roster_id, qbs, n: qbs.length, record: `${s.wins || 0}-${s.losses || 0}` };
  }).sort((a, b) => a.n - b.n);

  // byes ahead for Danny's active players (next 5 weeks); two QBs on the same bye is a superflex hole
  const byes = [];
  for (let w = week + 1; w <= week + 5; w++) {
    const out = roster.filter(r => r.slot !== "IR" && r.bye === w);
    if (out.length) byes.push({ week: w, players: out.map(r => `${r.name} (${r.pos}${r.slot === "START" ? ", starter" : ""})`), qbs: out.filter(r => r.pos === "QB").length });
  }
  const qb_byes = roster.filter(r => r.pos === "QB").map(r => `${r.name} ${r.bye || "?"}`);

  // DEF: Danny's unit this week and next, and the best free-agent units for both weeks (streaming)
  // opp_implied is the opponent's Vegas implied total, the first filter for a DEF stream
  const defRow = (pid, PR, SCH, GM) => { const p = P[pid]; const pr = PR[pid]; const g = SCH[p && p.team]; const env = GM[p && p.team]; return { id: pid, name: p ? p.name : pid, proj: pr ? pr.proj : 0, game: gameText(g, env), opp_implied: env ? env.opp_implied : null }; };
  const myDef = roster.find(r => r.pos === "DEF");
  const def = {
    mine: myDef ? { name: myDef.name, team: myDef.team, slot: myDef.slot, proj: myDef.proj, game: myDef.game, opp_implied: myDef.opp_implied ?? null, bye: myDef.bye, next: defRow(myDef.id, PROJN, SCHEDN, GAMESN) } : null,
    fa_this: (fa_top.DEF || []).map(r => ({ name: r.name, proj: r.proj, game: r.game, opp_implied: r.opp_implied ?? null, waivers: r.waivers || null })),
    fa_next: Object.entries(PROJN).filter(([pid, pr]) => pr.proj > 0 && !taken[pid] && P[pid] && P[pid].pos === "DEF")
      .sort((a, b) => b[1].proj - a[1].proj).slice(0, 4).map(([pid]) => defRow(pid, PROJN, SCHEDN, GAMESN)),
  };

  // FAAB: what every team has left, in waiver-priority order (priority only breaks tied bids)
  const budget = league.faab_budget || 0;
  const faab_teams = rosters.map(r => { const s = r.settings || {}; return { team: teamOf[r.roster_id], roster_id: r.roster_id, left: budget - (s.waiver_budget_used || 0), position: s.waiver_position || null }; })
    .sort((a, b) => (a.position || 99) - (b.position || 99));

  return {
    generated: nowPT(), generated_ms: Date.now(), season: st.season, week,
    faab_total: budget, faab_used: settings.waiver_budget_used || 0, faab_left: budget - (settings.waiver_budget_used || 0), faab_min_bid: league.faab_min_bid,
    faab_teams, waiver_position: settings.waiver_position || null, waiver_run: run.text, waiver_run_ms: run.ts, waiver_clear_days: league.waiver_clear_days,
    record: `${settings.wins || 0}-${settings.losses || 0}`,
    byes, qb_byes, def, next_week: week + 1,
    roster, lineup, ir, auto_subs, fa_qbs, fa_top, trending: trending.slice(0, 20), transactions, opponent, qb_depth, league, env_error: envErrors.length ? envErrors.join("; ") : null, source: "live",
  };
}
