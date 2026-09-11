#!/usr/bin/env python3
"""Bake the Sleeper sweep into app/gm.html (the offline fallback) and stage the site for Pages / Vercel.

  python3 scripts/build.py              # runs the sweep, injects, writes app/gm.html + site/
  python3 scripts/build.py --no-fetch   # reuse data/sweep.json instead of hitting Sleeper
                                        # (build.py also falls back to it by itself when Sleeper is unreachable)

Inputs
  data/sweep.json     from scripts/sweep.py (regenerated unless --no-fetch)
Outputs
  app/gm.html         same file, with the SWEEP block replaced in place
  site/index.html     copy of gm.html for GitHub Pages / Vercel, plus war-room.html, sweep.json,
                      sw.js, manifest.webmanifest and icons/ (the PWA shell)
"""
import sys, json, shutil, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

def replace_block(src, start, end, body):
    a, b = src.index(start), src.index(end)
    return src[:a + len(start)] + "\n" + body + "\n" + src[b:]

def main():
    fetch = "--no-fetch" not in sys.argv
    cached = ROOT / "data/sweep.json"
    data = None
    if fetch:
        try:
            import sweep
            data = sweep.main()
        except Exception as e:
            # Claude cloud sandboxes can't reach api.sleeper.app (egress policy 403). The GitHub Action
            # commits data/sweep.json on its schedule, so fall back to that copy.
            if not cached.exists():
                raise
            print(f"WARNING: Sleeper fetch failed ({type(e).__name__}: {str(e)[:100]}); using committed data/sweep.json", file=sys.stderr)
            fetch = False
    if data is None:
        data = json.loads(cached.read_text())
    # league calendar, cheap and cached with the sweep
    if fetch or "two_week_rounds" not in (data.get("league") or {}):
        try:
            import sleeper
            lg = sleeper.get(f"league/{sleeper.LEAGUE}")
            st = lg.get("settings") or {}
            data["league"] = {"trade_deadline": st.get("trade_deadline"), "playoff_week_start": st.get("playoff_week_start"),
                              "playoff_teams": st.get("playoff_teams"), "regular_weeks": (st.get("playoff_week_start") or 15) - 1,
                              "two_week_rounds": st.get("playoff_round_type") == 2,
                              "name": lg.get("name")}
            cached.write_text(json.dumps(data, indent=1))
        except Exception as e:
            print(f"WARNING: league settings fetch failed ({type(e).__name__}); keeping cached values", file=sys.stderr)

    page = (ROOT / "app/gm.html").read_text()
    sweep_json = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    page = replace_block(page, "<!-- SWEEP:START -->", "<!-- SWEEP:END -->",
                         f'<script id="sweep" type="application/json">{sweep_json}</script>')
    (ROOT / "app/gm.html").write_text(page)

    site = ROOT / "site"; site.mkdir(exist_ok=True)
    (site / "index.html").write_text(page)
    shutil.copy(ROOT / "app/war-room.html", site / "war-room.html")
    for f in ("sw.js", "manifest.webmanifest"):          # PWA shell (service worker must sit beside index.html)
        shutil.copy(ROOT / "app" / f, site / f)
    shutil.copytree(ROOT / "app/icons", site / "icons", dirs_exist_ok=True)
    (site / "sweep.json").write_text(json.dumps(data, indent=1))
    (site / ".nojekyll").write_text("")
    print(f"built site/ · week {data['week']} · sweep {data['generated']}")

if __name__ == "__main__":
    main()
