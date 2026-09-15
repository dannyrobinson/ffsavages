// Headlines for Danny's own players.
// Sleeper only carries a "news updated" timestamp, never the story, so the text comes from ESPN's public
// NFL news feed (no key, same best-effort contract as lib/games.js: a failure leaves the list empty).
// The join is Sleeper's espn_id against the feed's athlete categories, with a name match as the fallback
// for stories ESPN tagged loosely.

const FEED = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50";
// the league-wide feed alone rarely mentions a given roster; ESPN also filters the same feed by team
const TEAM_FEED = t => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=20&team=${t}`;

async function fetchJSON(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "robinsavages" } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/**
 * @param {Array<{id:string,name:string,espn_id?:string|number,team?:string}>} rows the players to match
 * @returns {Promise<{stories:Array,error:string|null}>} newest first; every story names the players it is about
 */
export async function playerNews(rows = []) {
  if (!rows.length) return { stories: [], error: null };
  const teams = [...new Set(rows.map(r => r.team).filter(t => t && t !== "FA"))];
  const feeds = await Promise.all([FEED, ...teams.map(TEAM_FEED)].map(u => fetchJSON(u).catch(e => ({ error: String(e.message || e) }))));
  const failed = feeds.filter(f => f.error);
  if (failed.length === feeds.length) return { stories: [], error: failed[0].error };
  const articles = [], seen = new Set();
  for (const f of feeds) for (const a of (f.articles || [])) {
    const key = ((a.links || {}).web || {}).href || a.headline;
    if (key && !seen.has(key)) { seen.add(key); articles.push(a); }
  }
  const feed = { articles };

  const byEspn = {};
  for (const r of rows) if (r.espn_id) byEspn[String(r.espn_id)] = r;
  const named = rows.filter(r => (r.name || "").includes(" "));

  const stories = [];
  for (const a of (feed.articles || [])) {
    const cats = a.categories || [];
    const hit = new Map();
    for (const c of cats) {
      const id = c.athlete && c.athlete.id != null ? String(c.athlete.id) : null;
      if (id && byEspn[id]) hit.set(byEspn[id].id, byEspn[id]);
    }
    const text = `${a.headline || ""} ${a.description || ""}`;
    for (const r of named) if (!hit.has(r.id) && text.includes(r.name)) hit.set(r.id, r);
    if (!hit.size) continue;
    const ms = Date.parse(a.published || a.lastModified || "") || null;
    stories.push({
      headline: a.headline || "", summary: a.description || "",
      published: a.published || null, published_ms: ms,
      link: ((a.links || {}).web || {}).href || null,
      players: [...hit.values()].map(r => ({ id: r.id, name: r.name })),
    });
  }
  stories.sort((a, b) => (b.published_ms || 0) - (a.published_ms || 0));
  return { stories, error: failed.length ? `${failed.length} of ${feeds.length} ESPN feeds failed` : null };
}
