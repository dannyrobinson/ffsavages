# Robinsavages — fantasy football GM for Danny

Danny Robinson's team in the **West Van Super Studs** Sleeper league (2026). This repo holds the draft
board we used on draft night, a phone GM app, and the Sleeper sweep that keeps it current. The app is
published at https://dannyrobinson.github.io/ffsavages/ (repo `dannyrobinson/ffsavages`, public because
GitHub Pages on a free plan needs it). The monitoring runs itself: a GitHub Action sweeps Sleeper and
republishes, and a scheduled Claude cloud agent writes the narrative briefing.

## The league (don't re-derive this; it's confirmed)
- Sleeper league `1312551337698820096`, draft `1312551337711386624`, Danny = user `1263724329326100480`
  (`dannyrobinson`, team "Robinsavages", roster_id 6, draft slot 6). 2025 league: `1261840012253597696`.
- Sleeper's API is public, no auth: `https://api.sleeper.app/v1/...` — see `scripts/sleeper.py`.
- 12 teams, **superflex** (QB, 2 RB, 2 WR, TE, 2 FLEX, SUPERFLEX, K, DEF, 5 BN, 2 IR). Full PPR, +0.5/rec
  for TE, 4-pt pass TD, −1 INT, −2 fumble. **$150 FAAB**, trade deadline week 10. No keepers. Superflex is
  new in 2026 (2025 was 1QB).
- **Playoffs: 6 teams, start week 12, two-week rounds (12–13, 14–15, 16–17)** per Sleeper's league settings
  (`playoff_week_start=12`, `playoff_round_type=2`). The regular season is only 11 weeks.
- Waivers: FAAB claims clear Wednesday morning PT (`waiver_day_of_week=2`, `waiver_clear_days=2`); free
  agents are first-come after that until they lock.
- Draft was Tue Sept 8 2026, 7 PM PT, 16 rounds. Danny picked 6, 19, 30, 43, 54, 67, 78, 91, 102, 115,
  126, 139, 150, 163, 174, 187.
- Full notes and the strategy we used: `docs/league-context.md`. Injury flags as of Sept 8 are in
  `app/war-room.html` (Notes tab) and `app/gm.html` (briefing block).

## How Danny wants to be advised
- Superflex first: a starting QB in the superflex slot ≈ +10 pts/week over a flex skill player. Keep 3
  startable QBs; any starting QB on waivers is a priority claim. TEs carry a premium (+0.5/rec).
- Be decisive. Headline the single most important move, then a short prioritized list with FAAB bids as
  whole dollars out of $150. Flag injuries/suspensions on his own players red/amber/green.
- He reads this on his phone. Short beats thorough.

## What's here
- `app/gm.html` — phone app. Tabs: Moves, Roster, News, Ask, Plan. Two blocks are baked in by
  `scripts/build.py` between HTML comment markers: `SWEEP` (JSON from the Sleeper sweep: roster with
  red/amber/green flags, free-agent starting QBs, trending adds that are free agents *here*, league
  transactions, this week's opponent, QB count per team) and `BRIEF` (Claude's narrative from
  `docs/briefing.md`). The roster re-syncs from the baked sweep whenever it is newer than what the phone
  saved. "What should I do next?" and Ask use the claude.ai artifact `sample` capability and only work
  inside the Claude app; on GitHub Pages the page is read-only but still current. The `POOL` array is
  the draft board's player list.
- `app/war-room.html` — the draft-night board (ranked 187 players, tiers, pick plan).
- `scripts/sleeper.py` — stdlib-only Sleeper client. `roster`, `picks`, `transactions`, `players`.
- `scripts/sweep.py` — the Sleeper sweep. Writes `data/sweep.json` + `data/sweep.md`.
- `scripts/build.py` — runs the sweep, converts `docs/briefing.md`, injects both into `app/gm.html`
  in place, and stages `site/` (index.html, war-room.html, sweep.json) for Pages. `--no-fetch` reuses
  `data/sweep.json`.
- `docs/briefing.md` — Claude's narrative briefing. Headline first, then "Do now", "Your players",
  "Waiver wire, checked against this league", "This week". Every waiver name must be checked against
  `data/sweep.json` (the `trending` list and the league rosters) before it is recommended.
- `docs/playbook.md` — researched champions' rules with sources; condensed copies live in `app/gm.html`
  (Plan tab and the RULES prompt).
- `.github/workflows/pages.yml` — on push and Tue/Wed/Thu/Sat/Sun 6:30 AM PT: sweep, commit `data/sweep.*`,
  build, deploy Pages.
- `data/sweep.json` + `data/sweep.md` are committed (by the Action); everything else in `data/` and all of
  `site/` is gitignored.

## How a briefing refresh works (this is the recurring job)
Runs as the Claude cloud routine "Robinsavages briefing" (Sun/Tue/Thu/Sat 7 AM PT, model claude-sonnet-5,
manage at https://claude.ai/code/routines/trig_01H2oT2z2gAX3SJTUo788aFw). The GitHub Action separately
re-sweeps Sleeper data on its own schedule; both end in a Pages deploy.
1. `python3 scripts/build.py` — sweeps Sleeper and bakes the data. Read `data/sweep.md`. **Claude cloud
   sandboxes cannot reach `api.sleeper.app`** (egress policy returns 403), so there the script falls back to
   the committed `data/sweep.json`, which the GitHub Action refreshes and commits at 6:30 AM PT on sweep
   days. Check the sweep's `generated` stamp; if it is more than a day old, say so in the briefing.
2. Web-search news for every AMBER/RED player and for anything spiking in the `trending` list (a spike
   usually means an injury to the starter ahead of him). Check Danny's QBs first, then Nabers.
3. Write `docs/briefing.md` in Danny's format (see above). Whole-dollar FAAB bids out of what's left,
   odd numbers. Only recommend players the sweep confirms are free agents in this league.
4. `python3 scripts/build.py --no-fetch`, commit `app/gm.html` + `docs/briefing.md`, push to `main`.
   The Pages workflow redeploys on push.
Nice-to-have next: `scripts/lineup.py` (optimal lineup from the sweep + projections); bye weeks for
Danny's players (Sleeper doesn't expose them; research once and bake into the Plan tab).

## Conventions
- Python 3.9+, no third-party deps unless there's a good reason. Keep the HTML apps single-file.
- Don't commit `data/*.json`. Don't put anything private in the HTML — the GM app is a hosted page.
- Dates matter: it's the 2026 season. Player-team pairs in the HTML reflect Sept 8 2026 cutdowns.

## Danny's drafted roster (from Sleeper draft picks, Sept 8 2026)
QB Joe Burrow (1.06) · QB Caleb Williams (2.07) · WR A.J. Brown (3.06) · RB Chase Brown (4.07) ·
WR Malik Nabers (5.06, Questionable — knee) · WR Jaylen Waddle (6.07) · RB Quinshon Judkins (7.06) ·
QB Malik Willis (8.07) · RB Jaylen Warren (9.06) · RB Jordan Mason (10.07) · WR Alec Pierce (11.06) ·
TE Juwan Johnson (12.07) · RB MarShawn Lloyd (13.06) · K Ka'imi Fairbairn (14.07) · DEF Detroit (15.06) ·
TE Dalton Schultz (16.07).
Weak spots: TE (Juwan Johnson / Schultz), QB3 (Willis is a starter but low ceiling), no elite RB.
Nabers' Week 1 status is the first thing to check every sweep. Notable league roster facts: TheBigHelmet
(slot 12) has Mahomes + Etienne; EasyIP (slot 1) has Gibbs + McBride + Shough; HappyChappy18 (slot 5, commish)
has Lawrence + Jefferson + Kyren.
