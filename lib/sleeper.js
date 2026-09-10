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

export async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: { "user-agent": "robinsavages-gm/1.0" } });
  if (!r.ok) throw new Error(`Sleeper ${path} -> ${r.status}`);
  return r.json();
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
  const [P, rosters, usersRaw, trendRaw, txRaw, mus, league] = await Promise.all([
    players(force), get(`league/${LEAGUE}/rosters`), get(`league/${LEAGUE}/users`),
    get("players/nfl/trending/add?lookback_hours=48&limit=60"), get(`league/${LEAGUE}/transactions/${week}`),
    get(`league/${LEAGUE}/matchups/${week}`).catch(e => ({ error: String(e.message || e) })), leagueInfo(),
  ]);
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
    const row = playerRow(pid, P);
    row.slot = reserve.includes(pid) ? "IR" : starters.includes(pid) ? "START" : "BN";
    return row;
  }).sort((a, b) => (ORDER[a.pos] ?? 9) - (ORDER[b.pos] ?? 9) || a.name.localeCompare(b.name));

  const fa_qbs = Object.entries(P)
    .filter(([pid, p]) => p.pos === "QB" && p.team && !taken[pid] && p.depth_chart_order === 1 && p.status === "Active")
    .map(([pid]) => playerRow(pid, P))
    .sort((a, b) => (P[a.id].search_rank || 9999) - (P[b.id].search_rank || 9999));

  const trending = [];
  for (const t of trendRaw) {
    const pid = t.player_id, p = P[pid];
    if (!p || taken[pid]) continue;
    const row = playerRow(pid, P); row.adds = t.count;
    if (row.flag === "red" && ["ir", "out", "sus", "pup", "nfi"].includes((p.injury_status || "").toLowerCase())) continue;
    trending.push(row);
  }
  trending.sort((a, b) => ((a.pos === "K" || a.pos === "DEF") - (b.pos === "K" || b.pos === "DEF")) || b.adds - a.adds);

  const transactions = txRaw.map(t => ({
    type: t.type, status: t.status, team: teamOf[(t.roster_ids || [])[0]] || "?",
    adds: Object.keys(t.adds || {}).map(p => (P[p] || {}).name || p), drops: Object.keys(t.drops || {}).map(p => (P[p] || {}).name || p),
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
        starters: (o.starters || []).filter(p => p && p !== "0").map(p => playerRow(p, P)),
        my_points: me.points, their_points: o.points,
      };
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
    roster, fa_qbs, trending: trending.slice(0, 20), transactions, opponent, qb_depth, league, source: "live",
  };
}
