"""Headlines for Danny's own players, from ESPN's public NFL news feed (no key).

The Node side is lib/news.js; this is the same join, for the offline bake. Sleeper only carries a
"news updated" date, never the story, so the text comes from ESPN and is matched to the roster on
Sleeper's espn_id, with a name match as the fallback. Best effort: a failure leaves the list empty.
"""
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor

FEED = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50"
TEAM_FEED = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=20&team={}"


def _get(url, timeout=8):
    req = urllib.request.Request(url, headers={"User-Agent": "robinsavages"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def player_news(rows):
    """rows: [{id, name, team, espn_id}] -> (stories newest first, error or None)."""
    if not rows:
        return [], None
    teams = sorted({r.get("team") for r in rows if r.get("team") and r["team"] != "FA"})
    urls = [FEED] + [TEAM_FEED.format(t) for t in teams]

    def pull(u):
        try:
            return _get(u)
        except Exception as exc:  # noqa: BLE001
            return {"_error": str(exc)}

    with ThreadPoolExecutor(max_workers=6) as pool:
        feeds = list(pool.map(pull, urls))
    failed = [f for f in feeds if f.get("_error")]
    if len(failed) == len(feeds):
        return [], failed[0]["_error"]

    articles, seen = [], set()
    for f in feeds:
        for a in f.get("articles") or []:
            key = ((a.get("links") or {}).get("web") or {}).get("href") or a.get("headline")
            if key and key not in seen:
                seen.add(key)
                articles.append(a)

    by_espn = {str(r["espn_id"]): r for r in rows if r.get("espn_id")}
    named = [r for r in rows if " " in (r.get("name") or "")]

    stories = []
    for a in articles:
        hit = {}
        for c in a.get("categories") or []:
            ath = c.get("athlete") or {}
            if ath.get("id") is not None and str(ath["id"]) in by_espn:
                r = by_espn[str(ath["id"])]
                hit[r["id"]] = r
        text = f"{a.get('headline') or ''} {a.get('description') or ''}"
        for r in named:
            if r["id"] not in hit and r["name"] in text:
                hit[r["id"]] = r
        if not hit:
            continue
        stories.append({"headline": a.get("headline") or "", "summary": a.get("description") or "",
                        "published": a.get("published"), "published_ms": _ms(a.get("published")),
                        "link": ((a.get("links") or {}).get("web") or {}).get("href"),
                        "players": [{"id": r["id"], "name": r["name"]} for r in hit.values()]})
    stories.sort(key=lambda s: s["published_ms"] or 0, reverse=True)
    return stories, (f"{len(failed)} of {len(feeds)} ESPN feeds failed" if failed else None)


def _ms(iso):
    if not iso:
        return None
    try:
        import datetime
        return int(datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:  # noqa: BLE001
        return None
