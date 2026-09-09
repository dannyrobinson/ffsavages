# Robinsavages — fantasy football GM for Danny

Danny Robinson's team in the **West Van Super Studs** Sleeper league (2026). This repo holds the draft
board we used on draft night, a phone GM app, and a Sleeper script. The job from here is to make the
monitoring *automatic* — the app can't fetch anything on its own, but you can.

## The league (don't re-derive this; it's confirmed)
- Sleeper league `1312551337698820096`, draft `1312551337711386624`, Danny = user `1263724329326100480`
  (`dannyrobinson`, team "Robinsavages", roster_id 6, draft slot 6). 2025 league: `1261840012253597696`.
- Sleeper's API is public, no auth: `https://api.sleeper.app/v1/...` — see `scripts/sleeper.py`.
- 12 teams, **superflex** (QB, 2 RB, 2 WR, TE, 2 FLEX, SUPERFLEX, K, DEF, 5 BN, 2 IR). Full PPR, +0.5/rec
  for TE, 4-pt pass TD, −1 INT, −2 fumble. **$150 FAAB**, 6 playoff teams, trade deadline week 10.
  No keepers. Superflex is new in 2026 (2025 was 1QB).
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
- `app/gm.html` — phone app (published on claude.ai as "Robinsavages GM"). Tabs: Moves, Roster, News, Ask.
  Uses the claude.ai artifact `sample` capability (`claude.use("sample")`) to ask Claude; state in
  localStorage. It **cannot** reach the network: Danny pastes news / uploads screenshots, or a static
  `briefing` block gets republished. The `POOL` array is the draft board's player list.
- `app/war-room.html` — the draft-night board (ranked 187 players, tiers, pick plan). Tries to poll
  Sleeper directly; works when opened as a local file in a browser.
- `scripts/sleeper.py` — stdlib-only. `roster`, `picks`, `transactions`, `players`. Writes `data/`.
- `data/` — gitignored cache (`players.json` is large).

## Build plan (in order)
1. **Roster.** Run `python3 scripts/sleeper.py roster` and confirm it matches Sleeper. Then bake the
   roster into `app/gm.html` as the default `S.roster` (keep localStorage override).
2. **News sweep.** Add `scripts/sweep.py`: for each rostered player, pull Sleeper's `injury_status` /
   `news_updated` from the players endpoint, plus search recent news (injuries, suspensions,
   depth-chart changes) and this week's league `transactions`. Output `data/briefing.md` with
   red/amber/green per player and a waiver-target list (free agents with rising snap/target share,
   any QB who just became a starter).
3. **Inject the briefing** into `app/gm.html` (replace the `<div class="brief">` contents) and
   republish/commit. Danny's chat Claude can also republish it.
4. **Schedule it.** Locally: a launchd/cron job Tue (waivers clear Wed morning PT), Thu, Sat, Sun morning.
   On Claude Code web: `/schedule` a recurring task that runs the sweep and opens a PR.
5. Nice-to-have: `scripts/lineup.py` that proposes the optimal lineup from `data/roster.json` +
   injury statuses; a weekly opponent preview from `league/<id>/matchups/<week>`.

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
