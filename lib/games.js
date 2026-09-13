// Game environment for a week: kickoff time, Vegas line, roof and weather for every team.
// Primary source: nflverse's games.csv on GitHub (kickoff in Eastern time, roof, stadium, home spread and total;
// reachable from anywhere, no key). Overlay, best-effort: ESPN's public scoreboard (whether a retractable roof is
// expected closed, the live DraftKings line, the sky); ESPN answers 403 to Vercel's servers, so production usually
// runs without it. Weather: Open-Meteo (wind, gusts, rain chance, snow at kickoff for outdoor stadiums; no key).
// Everything is best-effort: a failure leaves the fields null and is listed in the map's non-enumerable `_errors`.
// The playbook uses these as the game-environment inputs the research says matter (implied total, spread, wind 20+
// mph, snow) and for the auto-sub deadlines (a pair must be set before the earlier kickoff).
const NFLVERSE = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const METEO = "https://api.open-meteo.com/v1/forecast";
const TZ = "America/Vancouver";
const ET = "America/New_York";
const ABBR = { WSH: "WAS", LA: "LAR" };   // ESPN / nflverse -> Sleeper team codes
const UA = { "user-agent": "robinsavages-gm/1.0" };
const BROWSER_UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", accept: "application/json, text/plain, */*" };

// Home stadiums: city (to spot a neutral-site or international game), coordinates for the wind forecast, roof.
// "covered" is SoFi, a fixed roof with open sides where wind is negligible.
export const STADIUMS = {
  ARI: ["Glendale", 33.5276, -112.2626, "retractable"], ATL: ["Atlanta", 33.7554, -84.4010, "retractable"],
  BAL: ["Baltimore", 39.2780, -76.6227, "outdoor"], BUF: ["Orchard Park", 42.7738, -78.7870, "outdoor"],
  CAR: ["Charlotte", 35.2258, -80.8528, "outdoor"], CHI: ["Chicago", 41.8623, -87.6167, "outdoor"],
  CIN: ["Cincinnati", 39.0954, -84.5160, "outdoor"], CLE: ["Cleveland", 41.5061, -81.6995, "outdoor"],
  DAL: ["Arlington", 32.7473, -97.0945, "retractable"], DEN: ["Denver", 39.7439, -105.0201, "outdoor"],
  DET: ["Detroit", 42.3400, -83.0456, "dome"], GB: ["Green Bay", 44.5013, -88.0622, "outdoor"],
  HOU: ["Houston", 29.6847, -95.4107, "retractable"], IND: ["Indianapolis", 39.7601, -86.1639, "retractable"],
  JAX: ["Jacksonville", 30.3239, -81.6373, "outdoor"], KC: ["Kansas City", 39.0489, -94.4839, "outdoor"],
  LV: ["Las Vegas", 36.0909, -115.1833, "dome"], LAC: ["Inglewood", 33.9535, -118.3392, "covered"],
  LAR: ["Inglewood", 33.9535, -118.3392, "covered"], MIA: ["Miami Gardens", 25.9580, -80.2389, "outdoor"],
  MIN: ["Minneapolis", 44.9736, -93.2575, "dome"], NE: ["Foxborough", 42.0909, -71.2643, "outdoor"],
  NO: ["New Orleans", 29.9511, -90.0812, "dome"], NYG: ["East Rutherford", 40.8135, -74.0745, "outdoor"],
  NYJ: ["East Rutherford", 40.8135, -74.0745, "outdoor"], PHI: ["Philadelphia", 39.9008, -75.1675, "outdoor"],
  PIT: ["Pittsburgh", 40.4468, -80.0158, "outdoor"], SF: ["Santa Clara", 37.4033, -121.9694, "outdoor"],
  SEA: ["Seattle", 47.5952, -122.3316, "outdoor"], TB: ["Tampa", 27.9759, -82.5033, "outdoor"],
  TEN: ["Nashville", 36.1665, -86.7713, "outdoor"], WAS: ["Landover", 38.9076, -76.8645, "outdoor"],
};

async function getText(url, headers, ms) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url.replace(/^https?:\/\//, "").slice(0, 50)} -> ${r.status}`);
  return r.text();
}
const getJSON = async (url, headers, ms) => JSON.parse(await getText(url, headers, ms));
const code = t => ABBR[t] || t;

/** "Sun 10:00 AM" in Pacific time. */
export function kickPT(iso) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");
}
/** The kickoff window, by Pacific time. */
export function windowOf(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  const hour = Number(d.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }));
  if (day === "Sun") return hour < 9 ? "Sun morning" : hour < 12 ? "Sun early" : hour < 16 ? "Sun late" : "Sun night";
  if (day === "Mon" || day === "Thu") return `${day} night`;
  return day;
}
// minutes east of UTC for a zone at an instant (US zones are negative)
function offsetMinutes(tz, ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms) / 60000;
}
/** "2026-09-13" + "13:00" in Eastern time -> ISO instant. */
export function etToISO(day, hm) {
  const guess = Date.parse(`${day}T${hm}:00Z`);
  return new Date(guess - offsetMinutes(ET, guess) * 60000).toISOString();
}

// --- nflverse schedule (all seasons in one CSV, ~2 MB; cached 30 min) ---
function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
let nflverseCache = { ts: 0, season: null, byWeek: null };
async function nflverseWeek(season, week) {
  if (!nflverseCache.byWeek || nflverseCache.season !== season || Date.now() - nflverseCache.ts > 30 * 60 * 1000) {
    const rows = parseCSV(await getText(NFLVERSE, UA, 15000)).filter(r => r.season === String(season) && r.game_type === "REG");
    const byWeek = {};
    for (const r of rows) (byWeek[Number(r.week)] ||= []).push(r);
    nflverseCache = { ts: Date.now(), season, byWeek };
  }
  return nflverseCache.byWeek[Number(week)] || [];
}

// --- ESPN scoreboard overlay (kickoff, venue.indoor, DraftKings line, sky); keyed "AWAY@HOME" ---
async function espnWeek(season, week) {
  const sb = await getJSON(`${SCOREBOARD}?dates=${season}&seasontype=2&week=${week}`, BROWSER_UA, 6000);
  const out = {};
  for (const e of sb.events || []) {
    const c = (e.competitions || [])[0]; if (!c) continue;
    const home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
    if (!home || !away) continue;
    const H = code(home.team.abbreviation), A = code(away.team.abbreviation);
    const odds = (c.odds || [])[0] || {};
    let homeSpread = null;   // negative when the home team is favored
    const m = /^([A-Z]+)\s+(-?[\d.]+)$/.exec(odds.details || "");
    if (m) { const pts = Math.abs(Number(m[2])); homeSpread = code(m[1]) === H ? -pts : pts; }
    else if (/EVEN|PK/i.test(odds.details || "")) homeSpread = 0;
    const state = ((c.status || {}).type || {}).state;
    out[`${A}@${H}`] = { kick: e.date, indoor: (c.venue || {}).indoor === true, homeSpread, total: odds.overUnder ?? null, sky: (e.weather && e.weather.displayValue) || null, status: state === "post" ? "complete" : state === "in" ? "in_progress" : "pre_game" };
  }
  return out;
}

// --- Open-Meteo: wind, gusts, rain chance, snow and temperature over the three hours from kickoff ---
let meteoCache = new Map();   // "lat,lon,date" -> { ts, hourly }
async function forecast(lat, lon, iso) {
  const day = iso.slice(0, 10);
  const next = new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const key = `${lat},${lon},${day}`;
  const hit = meteoCache.get(key);
  if (hit && Date.now() - hit.ts < 30 * 60 * 1000) return hit.hourly;
  const q = `latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m,precipitation_probability,precipitation,snowfall,temperature_2m` +
    `&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC&start_date=${day}&end_date=${next}`;
  const j = await getJSON(`${METEO}?${q}`, UA, 6000);
  meteoCache.set(key, { ts: Date.now(), hourly: j.hourly });
  return j.hourly;
}
async function weatherAt(lat, lon, iso) {
  const h = await forecast(lat, lon, iso);
  const start = Date.parse(iso.slice(0, 13) + ":00:00Z");
  const idx = h.time.map((t, i) => [Date.parse(t + "Z"), i]).filter(([t]) => t >= start && t < start + 3 * 3600 * 1000).map(([, i]) => i);
  if (!idx.length) return null;
  const max = a => Math.max(...idx.map(i => a[i] ?? 0));
  return { wind: Math.round(max(h.wind_speed_10m)), gust: Math.round(max(h.wind_gusts_10m)), rain: Math.round(max(h.precipitation_probability)), snow: max(h.snowfall) > 0, temp: Math.round(h.temperature_2m[idx[0]] ?? 0) };
}

function envText(g) {
  if (g.indoor) return "indoor";
  const w = g.weather;
  if (!w) return g.roof === "covered" ? "covered stadium" : g.roof === "retractable" ? "retractable roof, likely closed" : null;
  const rain = w.snow ? "SNOW" : w.rain >= 60 ? "rain likely" : w.rain >= 30 ? "rain possible" : "dry";
  return `outdoor, wind ${w.wind} mph${w.gust >= 20 ? ` (gusts ${w.gust})` : ""}, ${rain}, ${w.temp}°F`;
}
function lineText(g) {
  if (g.total == null || g.spread == null) return null;
  const side = g.spread === 0 ? "pick'em" : g.spread < 0 ? `favored by ${-g.spread}` : `underdog by ${g.spread}`;
  return `${side}, total ${g.total}, implied ${g.implied} (opp ${g.opp_implied})`;
}

let cache = new Map();   // "season-week" -> { ts, games }
/**
 * team -> { opp, home, kick, kick_ms, kick_pt, window, status, venue, indoor, roof, spread (this team's, negative =
 * favored), total, implied, opp_implied, weather {wind, gust, rain, snow, temp}, sky, line, env }.
 * The returned map also carries a non-enumerable `_errors` array (source failures worth showing).
 */
export async function gamesFor(season, week) {
  const key = `${season}-${week}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.games;
  const errors = [];
  const rows = await nflverseWeek(season, week);            // throws if the schedule itself is unreachable
  const espn = process.env.GAMES_NO_ESPN ? {} : await espnWeek(season, week).catch(e => { errors.push(`espn: ${e.message || e}`); return {}; });
  const games = {};
  const pending = [];
  const now = Date.now();
  for (const r of rows) {
    const H = code(r.home_team), A = code(r.away_team);
    if (!r.gameday || !r.gametime) continue;
    const e = espn[`${A}@${H}`] || null;
    const kick = e ? e.kick : etToISO(r.gameday, r.gametime);
    const kick_ms = Date.parse(kick);
    const st = STADIUMS[H];
    const atHome = (r.location || "Home") === "Home" && !!st;
    const roofCsv = (r.roof || "").toLowerCase();             // outdoors | dome | closed | open | "" (retractable undecided)
    const indoor = e ? e.indoor : (roofCsv === "dome" || roofCsv === "closed");
    const roof = indoor ? "indoor" : roofCsv === "open" ? "outdoor" : atHome ? st[3] : roofCsv === "outdoors" ? "outdoor" : "unknown";
    const total = e && e.total != null ? e.total : r.total_line ? Number(r.total_line) : null;
    const homeSpread = e && e.homeSpread != null ? e.homeSpread : r.spread_line ? -Number(r.spread_line) : null;   // nflverse spread_line: positive = home favored
    const status = r.result !== "" && r.result != null ? "complete" : e ? e.status : now > kick_ms + 4 * 3600 * 1000 ? "complete" : now > kick_ms ? "in_progress" : "pre_game";
    const base = { kick, kick_ms, kick_pt: kickPT(kick), window: windowOf(kick), status, venue: r.stadium || null, indoor, roof, total, sky: e ? e.sky : null, weather: null };
    const imp = s => total == null || s == null ? null : Math.round((total - s) / 2 * 10) / 10;
    games[H] = { ...base, opp: A, home: true, spread: homeSpread, implied: imp(homeSpread), opp_implied: imp(homeSpread == null ? null : -homeSpread) };
    games[A] = { ...base, opp: H, home: false, spread: homeSpread == null ? null : -homeSpread, implied: imp(homeSpread == null ? null : -homeSpread), opp_implied: imp(homeSpread) };
    // wind only where it can blow: an open-air stadium (not a dome, not SoFi, not an undecided retractable), before kickoff
    if (roof === "outdoor" && atHome && status === "pre_game") {
      pending.push(weatherAt(st[1], st[2], kick).then(w => { games[H].weather = w; games[A].weather = w; }).catch(err => { if (!errors.some(x => x.startsWith("weather"))) errors.push(`weather: ${err.message || err}`); }));
    }
  }
  await Promise.all(pending);
  for (const g of Object.values(games)) { g.env = envText(g); g.line = lineText(g); }
  Object.defineProperty(games, "_errors", { value: errors, enumerable: false });
  cache.set(key, { ts: Date.now(), games });
  return games;
}
