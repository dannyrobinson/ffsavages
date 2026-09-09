#!/usr/bin/env python3
"""Pull Robinsavages' roster and league transactions from Sleeper (public API, no auth, stdlib only).

  python3 scripts/sleeper.py roster        # prints roster, writes data/roster.json
  python3 scripts/sleeper.py picks         # Danny's 2026 draft picks
  python3 scripts/sleeper.py transactions  # this week's waivers / trades / free agents
  python3 scripts/sleeper.py players       # refresh data/players.json (~5 MB raw; cached 6h)
"""
import json, sys, urllib.request, pathlib, time

LEAGUE = "1312551337698820096"
DRAFT  = "1312551337711386624"
ME     = "1263724329326100480"   # dannyrobinson
MY_ROSTER_ID = 6
API    = "https://api.sleeper.app/v1"
DATA   = pathlib.Path(__file__).resolve().parent.parent / "data"
DATA.mkdir(exist_ok=True)

PLAYER_FIELDS = ("position", "team", "injury_status", "injury_body_part", "injury_notes", "injury_start_date",
                 "news_updated", "practice_participation", "practice_description", "depth_chart_position",
                 "depth_chart_order", "status", "search_rank", "years_exp", "age")

def get(path):
    req = urllib.request.Request(f"{API}/{path}", headers={"User-Agent": "robinsavages-gm/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def state():
    return get("state/nfl")

def week():
    s = state()
    return int(s.get("leg") or s.get("week") or 1)

def players(max_age=6 * 3600):
    """Slim player map {id: {name,pos,team,injury,...}}. Cached in data/players.json."""
    f = DATA / "players.json"
    if f.exists() and time.time() - f.stat().st_mtime < max_age:
        try:
            cached = json.loads(f.read_text())
            if cached.get("_v") == 2:
                return cached["players"]
        except Exception:
            pass
    raw = get("players/nfl")
    slim = {}
    for k, v in raw.items():
        if v.get("position") not in ("QB", "RB", "WR", "TE", "K", "DEF"):
            continue
        row = {"name": v.get("full_name") or f"{v.get('first_name','')} {v.get('last_name','')}".strip(),
               "pos": v.get("position")}
        for fld in PLAYER_FIELDS:
            row[fld] = v.get(fld)
        row["injury"] = v.get("injury_status")
        slim[k] = row
    f.write_text(json.dumps({"_v": 2, "fetched": int(time.time()), "players": slim}))
    return slim

def my_roster(rosters=None):
    rosters = rosters or get(f"league/{LEAGUE}/rosters")
    return next(r for r in rosters if r["owner_id"] == ME)

def roster():
    P = players()
    mine = my_roster()
    def row(pid):
        x = P.get(pid, {"name": pid, "pos": "?", "team": "FA"})
        return {"id": pid, "name": x["name"], "pos": x["pos"], "team": x.get("team") or "FA", "injury": x.get("injury")}
    starters = [p for p in (mine.get("starters") or []) if p and p != "0"]
    reserve = mine.get("reserve") or []
    out = {"starters": [row(p) for p in starters],
           "bench":    [row(p) for p in mine.get("players", []) if p not in starters and p not in reserve],
           "ir":       [row(p) for p in reserve],
           "faab_used": (mine.get("settings") or {}).get("waiver_budget_used", 0)}
    (DATA / "roster.json").write_text(json.dumps(out, indent=1))
    for k in ("starters", "bench", "ir"):
        print(f"\n{k.upper()}")
        for r in out[k]:
            print(f"  {r['pos']:<3} {r['name']:<24} {r['team']:<3} {r['injury'] or ''}")
    print(f"\nFAAB used: ${out['faab_used']} of 150")

def picks():
    for pk in get(f"draft/{DRAFT}/picks"):
        if pk.get("picked_by") == ME:
            m = pk["metadata"]
            print(f"{pk['round']:>2}.{pk['draft_slot']:02d} #{pk['pick_no']:<3} {m.get('position'):<3} {m.get('first_name')} {m.get('last_name')} ({m.get('team')})")

def transactions():
    P = players()
    for t in get(f"league/{LEAGUE}/transactions/{week()}"):
        adds = [P.get(p, {}).get("name", p) for p in (t.get("adds") or {})]
        drops = [P.get(p, {}).get("name", p) for p in (t.get("drops") or {})]
        bid = (t.get("settings") or {}).get("waiver_bid")
        print(f"{t['type']:<12} {t['status']:<9} add {adds} drop {drops}" + (f" bid ${bid}" if bid else ""))

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "roster"
    {"roster": roster, "picks": picks, "transactions": transactions, "players": players}[cmd]()
