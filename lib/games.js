// Game environment for a week: kickoff time, Vegas line, roof and weather for every team. Sources are ESPN's
// public scoreboard (kickoff, venue, the DraftKings line, sky and temperature; no key) and Open-Meteo (wind and
// rain at kickoff for outdoor stadiums; no key). Best-effort: a failure leaves the fields null and the sweep
// carries on. The playbook uses these as the game-environment inputs the research says matter (implied total,
// spread, wind 20+ mph, snow) and for the auto-sub deadlines (a pair must be set before the earlier kickoff).
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const METEO = "https://api.open-meteo.com/v1/forecast";
const TZ = "America/Vancouver";
const ABBR = { WSH: "WAS" };   // ESPN -> Sleeper team codes
const HEADERS = { "user-agent": "robinsavages-gm/1.0" };

// Home stadiums: city (to spot a neutral-site or international game), coordinates for the wind forecast, roof.
// ESPN's venue.indoor covers domes and the retractables it expects closed; "covered" is SoFi, a fixed roof with
// open sides where wind is negligible.
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

async function getJSON(url, ms = 6000) {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url.slice(0, 60)} -> ${r.status}`);
  return r.json();
}
const sameCity = (a, b) => !!a && !!b && (a.toLowerCase().startsWith(b.toLowerCase().slice(0, 5)) || b.toLowerCase().startsWith(a.toLowerCase().slice(0, 5)));

/** "Sun 10:00 AM" in Pacific time. */
export function kickPT(iso) {
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");
}
/** The kickoff window, by Pacific time: what an auto-sub pairing has to respect. */
export function windowOf(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  const hour = Number(d.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }));
  if (day === "Sun") return hour < 9 ? "Sun morning" : hour < 12 ? "Sun early" : hour < 16 ? "Sun late" : "Sun night";
  if (day === "Mon" || day === "Thu") return `${day} night`;
  return day;
}

let meteoCache = new Map();   // "lat,lon,date" -> { ts, hourly }
async function forecast(lat, lon, iso) {
  const day = iso.slice(0, 10);
  const next = new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const key = `${lat},${lon},${day}`;
  const hit = meteoCache.get(key);
  if (hit && Date.now() - hit.ts < 30 * 60 * 1000) return hit.hourly;
  const q = `latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m,precipitation_probability,precipitation,snowfall,temperature_2m` +
    `&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC&start_date=${day}&end_date=${next}`;
  const j = await getJSON(`${METEO}?${q}`, 5000);
  meteoCache.set(key, { ts: Date.now(), hourly: j.hourly });
  return j.hourly;
}
/** Wind, gusts, rain chance, snow and temperature over the three hours from kickoff. */
async function weatherAt(lat, lon, iso) {
  const h = await forecast(lat, lon, iso);
  const start = Date.parse(iso.slice(0, 13) + ":00:00Z");
  const idx = h.time.map((t, i) => [Date.parse(t + "Z"), i]).filter(([t]) => t >= start && t < start + 3 * 3600 * 1000).map(([, i]) => i);
  if (!idx.length) return null;
  const max = a => Math.max(...idx.map(i => a[i] ?? 0));
  return {
    wind: Math.round(max(h.wind_speed_10m)), gust: Math.round(max(h.wind_gusts_10m)),
    rain: Math.round(max(h.precipitation_probability)), snow: max(h.snowfall) > 0,
    temp: Math.round(h.temperature_2m[idx[0]] ?? 0),
  };
}

function envText(g) {
  if (g.indoor) return "indoor";
  const w = g.weather;
  if (!w) return g.roof === "covered" ? "covered stadium" : null;
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
 */
export async function gamesFor(season, week) {
  const key = `${season}-${week}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.games;
  const sb = await getJSON(`${SCOREBOARD}?dates=${season}&seasontype=2&week=${week}`);
  const games = {};
  const pending = [];
  for (const e of sb.events || []) {
    const c = (e.competitions || [])[0]; if (!c) continue;
    const home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
    if (!home || !away) continue;
    const H = ABBR[home.team.abbreviation] || home.team.abbreviation, A = ABBR[away.team.abbreviation] || away.team.abbreviation;
    const odds = (c.odds || [])[0] || {};
    const total = odds.overUnder ?? null;
    let homeSpread = null;                                   // negative when the home team is favored
    const m = /^([A-Z]+)\s+(-?[\d.]+)$/.exec(odds.details || "");
    if (m) { const fav = ABBR[m[1]] || m[1]; const pts = Math.abs(Number(m[2])); homeSpread = fav === H ? -pts : pts; }
    else if (/EVEN|PK/i.test(odds.details || "")) homeSpread = 0;
    else if (typeof odds.spread === "number") homeSpread = odds.spread;
    const venue = c.venue || {};
    const st = STADIUMS[H];
    const atHome = st && sameCity((venue.address || {}).city, st[0]);
    const indoor = !!venue.indoor;
    const roof = indoor ? "indoor" : atHome ? st[3] : "unknown";
    const state = ((c.status || {}).type || {}).state;   // pre | in | post
    const base = {
      kick: e.date, kick_ms: Date.parse(e.date), kick_pt: kickPT(e.date), window: windowOf(e.date),
      status: state === "post" ? "complete" : state === "in" ? "in_progress" : "pre_game",
      venue: venue.fullName || null, indoor, roof, total, sky: (e.weather && e.weather.displayValue) || null, weather: null,
    };
    const imp = (spread) => total == null || spread == null ? null : Math.round((total - spread) / 2 * 10) / 10;
    games[H] = { ...base, opp: A, home: true, spread: homeSpread, implied: imp(homeSpread), opp_implied: imp(homeSpread == null ? null : -homeSpread) };
    games[A] = { ...base, opp: H, home: false, spread: homeSpread == null ? null : -homeSpread, implied: imp(homeSpread == null ? null : -homeSpread), opp_implied: imp(homeSpread) };
    // wind only where it can blow: outdoor, or a retractable ESPN does not report closed, at the home stadium, before kickoff
    if (!indoor && atHome && st[3] !== "covered" && state === "pre") {
      pending.push(weatherAt(st[1], st[2], e.date).then(w => { games[H].weather = w; games[A].weather = w; }).catch(() => {}));
    }
  }
  await Promise.all(pending);
  for (const g of Object.values(games)) { g.env = envText(g); g.line = lineText(g); }
  cache.set(key, { ts: Date.now(), games });
  return games;
}
