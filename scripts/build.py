#!/usr/bin/env python3
"""Bake the Sleeper sweep and Claude's briefing into app/gm.html, and stage the GitHub Pages site.

  python3 scripts/build.py              # runs the sweep, injects, writes app/gm.html + site/
  python3 scripts/build.py --no-fetch   # reuse data/sweep.json instead of hitting Sleeper
                                        # (build.py also falls back to it by itself when Sleeper is unreachable)

Inputs
  data/sweep.json     from scripts/sweep.py (regenerated unless --no-fetch)
  docs/briefing.md    Claude's narrative briefing (red/amber/green + FAAB bids). Hand-written or
                      written by the scheduled cloud agent. Tiny markdown subset: #, ##, -, **, links.
Outputs
  app/gm.html         same file, with the SWEEP and BRIEF blocks replaced in place
  site/index.html     copy of gm.html for GitHub Pages / Vercel, plus war-room.html, sweep.json,
                      sw.js, manifest.webmanifest and icons/ (the PWA shell)
"""
import sys, json, re, html, shutil, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

def md_to_html(md):
    out, in_ul = [], False
    def inline(s):
        s = html.escape(s, quote=False)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
        return s
    for line in md.splitlines():
        line = line.rstrip()
        if line.startswith("- ") or line.startswith("* "):
            if not in_ul: out.append("<ul>"); in_ul = True
            out.append(f"<li>{inline(line[2:])}</li>"); continue
        if in_ul: out.append("</ul>"); in_ul = False
        if not line: continue
        if line.startswith("# "): out.append(f'<div class="stamp">{inline(line[2:])}</div>')
        elif line.startswith("## "): out.append(f"<h4>{inline(line[3:])}</h4>")
        else: out.append(f"<p>{inline(line)}</p>")
    if in_ul: out.append("</ul>")
    return "\n".join(out)

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

    brief_md = (ROOT / "docs/briefing.md")
    brief_html = md_to_html(brief_md.read_text()) if brief_md.exists() else \
        '<div class="stamp">No briefing written yet.</div>'

    page = (ROOT / "app/gm.html").read_text()
    sweep_json = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    page = replace_block(page, "<!-- SWEEP:START -->", "<!-- SWEEP:END -->",
                         f'<script id="sweep" type="application/json">{sweep_json}</script>')
    page = replace_block(page, "<!-- BRIEF:START -->", "<!-- BRIEF:END -->", brief_html)
    (ROOT / "app/gm.html").write_text(page)

    site = ROOT / "site"; site.mkdir(exist_ok=True)
    (site / "index.html").write_text(page)
    shutil.copy(ROOT / "app/war-room.html", site / "war-room.html")
    for f in ("sw.js", "manifest.webmanifest"):          # PWA shell (service worker must sit beside index.html)
        shutil.copy(ROOT / "app" / f, site / f)
    shutil.copytree(ROOT / "app/icons", site / "icons", dirs_exist_ok=True)
    (site / "sweep.json").write_text(json.dumps(data, indent=1))
    (site / ".nojekyll").write_text("")
    print(f"built site/ · week {data['week']} · sweep {data['generated']} · briefing {'yes' if brief_md.exists() else 'none'}")

if __name__ == "__main__":
    main()
