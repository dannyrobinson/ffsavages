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
export async function projections(season, week) {
  const pos = ["QB", "RB", "WR", "TE", "K", "DEF"].map(p => `position[]=${p}`).join("&");
  const rows = await getRaw(`projections/nfl/${season}/${week}?season_type=regular&${pos}`);
  const out = {};
  for (const r of rows) {
    const st = r.stats || {}; if (st.pts_ppr == null) continue;
    const pos = r.player && r.player.position;
    const pts = st.pts_ppr + (pos === "TE" ? 0.5 * (st.rec || 0) : 0);
    out[r.player_id] = { proj: Math.round(pts * 10) / 10, opp: r.opponent || null, date: r.date || null };
  }
  return out;
}
/** team -> {date, day, opp, home, status} for the week. */
export async function schedule(season, week) {
  const games = await getRaw(`schedule/nfl/regular/${season}`);
  const out = {};
  for (const g of games) {
    if (Number(g.week) !== Number(week)) continue;
    out[g.home] = { date: g.date, day: WEEKDAY(g.date), opp: g.away, home: true, status: g.status };
    out[g.away] = { date: g.date, day: WEEKDAY(g.date), opp: g.home, home: false, status: g.status };
  }
  return out;
}
export function gameText(g) {
  if (!g) return "bye";
  const when = g.status === "complete" ? "played" : g.status === "in_progress" ? "IN PROGRESS" : g.day;
  return `${when} ${g.home ? "vs" : "@"} ${g.opp}`;
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
  const [P, rosters, usersRaw, trendRaw, txRaw, mus, league, PROJ, SCHED] = await Promise.all([
    players(force), get(`league/${LEAGUE}/rosters`), get(`league/${LEAGUE}/users`),
    get("players/nfl/trending/add?lookback_hours=48&limit=60"), get(`league/${LEAGUE}/transactions/${week}`),
    get(`league/${LEAGUE}/matchups/${week}`).catch(e => ({ error: String(e.message || e) })), leagueInfo(),
    projections(st.season, week).catch(() => ({})), schedule(st.season, week).catch(() => ({})),
  ]);
  const enrich = row => {   // projected points + game for any player row
    const pr = PROJ[row.id]; const p = P[row.id];
    row.proj = pr ? pr.proj : 0;
    const g = SCHED[p && p.team]; row.game = gameText(g); row.locked = !!(g && g.status !== "pre_game");
    row.room = roomOf(row.id, P);
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
  const lineup = {
    current: current.map(c => ({ slot: c.slot, id: c.player && c.player.id, name: c.player && c.player.name, pos: c.player && c.player.pos, proj: c.player ? c.player.proj : 0 })),
    current_pts: currentPts,
    optimal: opt.slots.map(c => ({ slot: c.slot, id: c.player && c.player.id, name: c.player && c.player.name, pos: c.player && c.player.pos, proj: c.player ? c.player.proj : 0 })),
    optimal_pts: opt.pts,
    start: roster.filter(r => optIds.has(r.id) && !curIds.has(r.id)).map(r => r.name),
    sit: roster.filter(r => curIds.has(r.id) && !optIds.has(r.id)).map(r => r.name),
  };

  const fa_qbs = Object.entries(P)
    .filter(([pid, p]) => p.pos === "QB" && p.team && !taken[pid] && p.depth_chart_order === 1 && p.status === "Active")
    .map(([pid]) => enrich(playerRow(pid, P)))
    .sort((a, b) => (P[a.id].search_rank || 9999) - (P[b.id].search_rank || 9999));

  // best free agents in THIS league by this week's projection, per position
  const fa_top = {};
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"]) {
    fa_top[pos] = Object.entries(PROJ)
      .filter(([pid, pr]) => pr.proj > 0 && !taken[pid] && P[pid] && P[pid].pos === pos && P[pid].team && (pos === "DEF" || P[pid].status === "Active"))
      .sort((a, b) => b[1].proj - a[1].proj).slice(0, pos === "K" || pos === "DEF" ? 3 : 6)
      .map(([pid]) => enrich(playerRow(pid, P)));
  }

  const trending = [];
  for (const t of trendRaw) {
    const pid = t.player_id, p = P[pid];
    if (!p || taken[pid]) continue;
    const row = enrich(playerRow(pid, P)); row.adds = t.count;
    if (row.flag === "red" && ["ir", "out", "sus", "pup", "nfi"].includes((p.injury_status || "").toLowerCase())) continue;
    trending.push(row);
  }
  trending.sort((a, b) => ((a.pos === "K" || a.pos === "DEF") - (b.pos === "K" || b.pos === "DEF")) || b.adds - a.adds);

  const transactions = txRaw.map(t => ({
    id: t.transaction_id, type: t.type, status: t.status, team: teamOf[(t.roster_ids || [])[0]] || "?",
    adds: Object.keys(t.adds || {}).map(p => (P[p] || {}).name || p), drops: Object.keys(t.drops || {}).map(p => (P[p] || {}).name || p),
    // who was let go, and whether he is still a free agent here (worth a look if his projection is real)
    dropped: Object.keys(t.drops || {}).filter(p => P[p]).map(p => { const r = enrich(playerRow(p, P)); r.fa = !taken[p]; return r; }),
    bid: (t.settings || {}).waiver_bid ?? null, ts: t.status_updated || t.created,
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

  return {
    generated: nowPT(), generated_ms: Date.now(), season: st.season, week,
    faab_used: settings.waiver_budget_used || 0, faab_total: 150, record: `${settings.wins || 0}-${settings.losses || 0}`,
    roster, lineup, fa_qbs, fa_top, trending: trending.slice(0, 20), transactions, opponent, qb_depth, league, source: "live",
  };
}
