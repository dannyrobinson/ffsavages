#!/usr/bin/env python3
"""Sleeper sweep for Robinsavages. Stdlib only, no auth.

  python3 scripts/sweep.py            # writes data/sweep.json + data/sweep.md, prints the summary

What it pulls (all public Sleeper endpoints):
  - my roster with injury / practice / depth-chart status -> RED / AMBER / GREEN per player
  - every free agent QB who is his team's starter (superflex priority claims)
  - trending adds (last 48h, league-wide on Sleeper) that are free agents in OUR league
  - this week's league transactions (who's spending FAAB on what, with the winning bids)
  - this week's opponent and their lineup
  - QB depth of every team in the league (who's a QB buyer / seller)
"""
import json, sys, time, datetime, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sleeper as S

POS_ORDER = {"QB": 0, "RB": 1, "WR": 2, "TE": 3, "K": 4, "DEF": 5}
RED_INJ = {"out", "ir", "pup", "sus", "nfi", "cov", "doubtful", "dnr"}
RED_STATUS = {"Injured Reserve", "Inactive", "Suspended", "PUP", "Physically Unable to Perform",
              "Non Football Injury", "Reserve/COVID-19", "Practice Squad"}

def now_pt():
    # Vancouver time without needing zoneinfo data on every box
    import zoneinfo
    try:
        return datetime.datetime.now(zoneinfo.ZoneInfo("America/Vancouver"))
    except Exception:
        return datetime.datetime.now()

def flag(p):
    """(colour, reason) for one player row from the slim players map."""
    inj = (p.get("injury_status") or "").lower()
    st = p.get("status") or ""
    part, notes = p.get("injury_body_part"), p.get("injury_notes")
    prac = (p.get("practice_participation") or "")
    depth = p.get("depth_chart_order")
    pos = p.get("pos")
    detail = " · ".join(x for x in (p.get("injury_status"), part, notes) if x)
    if not p.get("team"):
        return "red", "Free agent / no team"
    if inj in RED_INJ or st in RED_STATUS:
        return "red", detail or st
    if pos == "QB" and depth and depth >= 2:
        return "red", f"Not the starter (QB{depth})" + (f" · {detail}" if detail else "")
    if inj == "questionable":
        return "amber", detail
    if prac.lower() in ("limited", "dnp", "did not practice"):
        return "amber", f"Practice: {prac}" + (f" · {detail}" if detail else "")
    if pos == "RB" and depth and depth >= 2:
        return "amber", f"RB{depth} on the depth chart"
    if pos in ("WR", "TE") and depth and depth >= 3:
        return "amber", f"{pos}{depth} on the depth chart"
    if inj:
        return "amber", detail
    return "green", "Healthy, starting"

def ts_date(ms):
    if not ms:
        return None
    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%b %-d")

def player_row(pid, P):
    p = P.get(pid) or {"name": pid, "pos": "?", "team": None}
    colour, why = flag(p)
    return {"id": pid, "name": p["name"], "pos": p["pos"], "team": p.get("team") or "FA",
            "flag": colour, "why": why, "injury": p.get("injury_status"),
            "depth": f"{p.get('depth_chart_position') or ''}{p.get('depth_chart_order') or ''}".strip() or None,
            "news": ts_date(p.get("news_updated")), "news_ms": p.get("news_updated")}

def main(write=True):
    st = S.state()
    week = int(st.get("leg") or st.get("week") or 1)
    season = st.get("season")
    P = S.players()
    rosters = S.get(f"league/{S.LEAGUE}/rosters")
    users = {u["user_id"]: ((u.get("metadata") or {}).get("team_name") or u["display_name"]) for u in S.get(f"league/{S.LEAGUE}/users")}
    team_of = {r["roster_id"]: users.get(r["owner_id"], f"roster {r['roster_id']}") for r in rosters}
    taken = {}
    for r in rosters:
        for pid in (r.get("players") or []):
            taken[pid] = r["roster_id"]
    mine = next(r for r in rosters if r["owner_id"] == S.ME)
    starters = [p for p in (mine.get("starters") or []) if p and p != "0"]
    reserve = mine.get("reserve") or []
    settings = mine.get("settings") or {}
    # FAAB: the league's budget and minimum bid, and what every team has left (priority only breaks tied bids)
    try:
        ls = S.get(f"league/{S.LEAGUE}").get("settings") or {}
    except Exception:
        ls = {}
    budget = ls.get("waiver_budget") or 150
    faab_teams = sorted([{"team": team_of[r["roster_id"]], "roster_id": r["roster_id"],
                          "left": budget - ((r.get("settings") or {}).get("waiver_budget_used") or 0),
                          "position": (r.get("settings") or {}).get("waiver_position")} for r in rosters],
                        key=lambda t: t["position"] or 99)

    # --- my roster ---------------------------------------------------------
    roster = []
    for pid in mine.get("players", []):
        row = player_row(pid, P)
        row["slot"] = "IR" if pid in reserve else ("START" if pid in starters else "BN")
        roster.append(row)
    roster.sort(key=lambda r: (POS_ORDER.get(r["pos"], 9), r["name"]))

    # --- free-agent starting QBs -------------------------------------------
    fa_qbs = []
    for pid, p in P.items():
        if p["pos"] == "QB" and p.get("team") and pid not in taken and p.get("depth_chart_order") == 1 \
                and p.get("status") == "Active":
            fa_qbs.append(player_row(pid, P))
    fa_qbs.sort(key=lambda r: P[r["id"]].get("search_rank") or 9999)

    # --- trending adds that are free agents here ----------------------------
    trending = []
    for t in S.get("players/nfl/trending/add?lookback_hours=48&limit=60"):
        pid = t["player_id"]; p = P.get(pid)
        if not p or pid in taken:
            continue
        row = player_row(pid, P); row["adds"] = t["count"]
        if row["flag"] == "red" and (p.get("injury_status") or "").lower() in ("ir", "out", "sus", "pup", "nfi"):
            continue  # nobody needs an IR stash surfaced as a waiver target
        trending.append(row)
    # skill players first; K/DEF are streamed by matchup, not by add count
    trending.sort(key=lambda r: (r["pos"] in ("K", "DEF"), -r["adds"]))
    trending = trending[:20]

    # --- this week's league transactions -----------------------------------
    txns = []
    for t in S.get(f"league/{S.LEAGUE}/transactions/{week}"):
        who = team_of.get((t.get("roster_ids") or [None])[0], "?")
        adds = [P.get(p, {}).get("name", p) for p in (t.get("adds") or {})]
        drops = [P.get(p, {}).get("name", p) for p in (t.get("drops") or {})]
        txns.append({"type": t["type"], "status": t["status"], "team": who, "adds": adds, "drops": drops,
                     "bid": (t.get("settings") or {}).get("waiver_bid"), "note": (t.get("metadata") or {}).get("notes"),
                     "faab_moved": [{"from": team_of.get(b.get("sender"), "?"), "to": team_of.get(b.get("receiver"), "?"), "amount": b.get("amount")}
                                    for b in (t.get("waiver_budget") or [])],
                     "ts": t.get("status_updated") or t.get("created")})
    txns.sort(key=lambda x: -(x["ts"] or 0))

    # --- opponent this week --------------------------------------------------
    opp = None
    try:
        mus = S.get(f"league/{S.LEAGUE}/matchups/{week}")
        me_mu = next((m for m in mus if m["roster_id"] == S.MY_ROSTER_ID), None)
        if me_mu:
            o = next((m for m in mus if m["matchup_id"] == me_mu["matchup_id"] and m["roster_id"] != S.MY_ROSTER_ID), None)
            if o:
                orost = next(r for r in rosters if r["roster_id"] == o["roster_id"])
                oset = orost.get("settings") or {}
                opp = {"team": team_of[o["roster_id"]], "roster_id": o["roster_id"],
                       "record": f"{oset.get('wins',0)}-{oset.get('losses',0)}" + (f"-{oset['ties']}" if oset.get("ties") else ""),
                       "starters": [player_row(p, P) for p in (o.get("starters") or []) if p and p != "0"],
                       "my_points": me_mu.get("points"), "their_points": o.get("points")}
    except Exception as e:  # matchups can 404 before the schedule is generated
        opp = {"error": str(e)}

    # --- QB depth around the league (trade market) --------------------------
    qb_depth = []
    for r in rosters:
        qbs = [P[p]["name"] for p in (r.get("players") or []) if P.get(p, {}).get("pos") == "QB"]
        qb_depth.append({"team": team_of[r["roster_id"]], "roster_id": r["roster_id"], "qbs": qbs, "n": len(qbs),
                         "record": f"{(r.get('settings') or {}).get('wins',0)}-{(r.get('settings') or {}).get('losses',0)}"})
    qb_depth.sort(key=lambda x: x["n"])

    out = {"generated": now_pt().strftime("%a %b %-d, %Y %-I:%M %p PT"), "generated_ms": int(time.time() * 1000),
           "season": season, "week": week, "faab_total": budget, "faab_used": settings.get("waiver_budget_used", 0),
           "faab_left": budget - (settings.get("waiver_budget_used") or 0), "faab_min_bid": ls.get("waiver_bid_min", 1),
           "faab_teams": faab_teams, "waiver_position": settings.get("waiver_position"),
           "record": f"{settings.get('wins',0)}-{settings.get('losses',0)}",
           "roster": roster, "fa_qbs": fa_qbs, "trending": trending, "transactions": txns, "opponent": opp,
           "qb_depth": qb_depth}
    if write:
        (S.DATA / "sweep.json").write_text(json.dumps(out, indent=1))
        (S.DATA / "sweep.md").write_text(to_md(out))
    return out

def to_md(o):
    L = [f"# Sleeper sweep — Week {o['week']} · {o['generated']}", "",
         f"Record {o['record']} · FAAB ${o['faab_total'] - o['faab_used']} left of ${o['faab_total']}"
         + (f" · waiver priority {o['waiver_position']} of 12 (ties only)" if o.get('waiver_position') else ""), "", "## Roster"]
    for r in o["roster"]:
        L.append(f"- {r['flag'].upper():<5} {r['pos']:<3} {r['name']} ({r['team']}, {r['slot']}) — {r['why']}" + (f" · news {r['news']}" if r['news'] else ""))
    L += ["", "## Free-agent QBs who start for their NFL team"]
    L += [f"- {r['name']} ({r['team']}) — {r['why']}" for r in o["fa_qbs"]] or ["- none"]
    L += ["", "## Trending adds that are free agents in this league (48h Sleeper adds)"]
    L += [f"- {r['pos']:<3} {r['name']} ({r['team']}) · {r['adds']:,} adds · {r['depth'] or ''} · {r['why']}" for r in o["trending"]] or ["- none"]
    L += ["", f"## League transactions, week {o['week']}"]
    L += [f"- {t['team']}: {t['type']} {t['status']} +{t['adds']} -{t['drops']}" + (f" (${t['bid']})" if t['bid'] else "") for t in o["transactions"]] or ["- none yet"]
    if o["opponent"] and "team" in o["opponent"]:
        op = o["opponent"]
        L += ["", f"## Opponent: {op['team']} ({op['record']})"]
        L += [f"- {r['pos']:<3} {r['name']} ({r['team']}) {r['flag'].upper()}" for r in op["starters"]]
    L += ["", "## FAAB left by team (waiver-priority order)"]
    L += [f"- {t['team']}: ${t['left']}" + (f" (priority {t['position']})" if t.get('position') else "") for t in o.get("faab_teams", [])] or ["- n/a"]
    L += ["", "## QB depth by team (buyers have 2)"]
    L += [f"- {q['team']}: {q['n']} — {', '.join(q['qbs'])}" for q in o["qb_depth"]]
    return "\n".join(L) + "\n"

if __name__ == "__main__":
    o = main()
    print(to_md(o))
