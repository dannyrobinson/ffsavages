# Robinsavages — fantasy football GM for Danny

Danny Robinson's team in the **West Van Super Studs** Sleeper league (2026). This repo holds the draft
board we used on draft night, a phone GM app (an installable PWA), the Sleeper sweep that keeps it current,
and the Vercel functions behind the Claude advisor and push alerts. The app lives at
**https://robinsavages.vercel.app** (Vercel project `robinsavages`, team FirstPointEnergy, the only team on
Danny's account) and is mirrored, Sleeper-data only, at https://dannyrobinson.github.io/ffsavages/ (repo
`dannyrobinson/ffsavages`, public because GitHub Pages on a free plan needs it). Everything runs itself on
Vercel: the page pulls Sleeper live on every open; a cron checks Danny's world every 15 minutes and, when
anything moved, hands it to the Claude advisor; the advisor also runs hourly; it pushes a notification when
Danny should act. The goal it optimises for is the most fantasy points Danny's lineup can score. There is no
scheduled Claude cloud routine any more (the old "Robinsavages briefing" routine is disabled).

## The league (don't re-derive this; it's confirmed)
- Sleeper league `1312551337698820096`, draft `1312551337711386624`, Danny = user `1263724329326100480`
  (`dannyrobinson`, team "Robinsavages", roster_id 6, draft slot 6). 2025 league: `1261840012253597696`.
- Sleeper's API is public, no auth: `https://api.sleeper.app/v1/...` — see `scripts/sleeper.py`.
- 12 teams, **superflex** (QB, 2 RB, 2 WR, TE, 2 FLEX, SUPERFLEX, K, DEF, 5 BN, 2 IR). Full PPR, +0.5/rec
  for TE, 4-pt pass TD, −1 INT, −2 fumble. **$150 FAAB waivers** (Sleeper `waiver_type=2`, `waiver_budget=150`,
  `waiver_bid_min=1`). Danny confirmed Sept 11 that the league DOES bid; his Sept 10 "no bidding" was a mix-up
  with the 2025 league, which was rolling waivers (`waiver_type=0`). Trade deadline week 10. No keepers.
  Superflex is new in 2026 (2025 was 1QB).
- **Playoffs: 6 teams, start week 12, two-week rounds (12–13, 14–15, 16–17)** per Sleeper's league settings
  (`playoff_week_start=12`, `playoff_round_type=2`). The regular season is only 11 weeks.
- Waivers, per Sleeper's FAAB docs and verified against the 2025 league's transaction log (researched Sept 11):
  blind bids, whole numbers, min $1, highest bid wins; Sleeper processes the league's claims from the highest
  bid down; equal bids go to waiver priority, which rolls (winning a claim sends you to 12th; free-agent adds
  don't move it; Danny started at 7 of 12). The weekly run is **12:05 AM PT Wednesday** (Sleeper's "Tue After
  Day": `waiver_day_of_week=2`, `daily_waivers_hour=0`), so Tuesday night is the deadline; a free agent locks
  at kickoff and sits on waivers until that run. A **dropped** player is on waivers 48 h (`waiver_clear_days=2`)
  and the claims on him process exactly 48 h after the drop, at that hour, any day. Otherwise free agents are
  first-come, no bid, from Wednesday morning until kickoff. Several claims can be entered; one that names the
  same drop as a claim that already won fails harmlessly ("roster would have too many players"), which is how
  to make a backup claim conditional. FAAB can be included in trades (`waiver_budget` on the transaction).
  Sleeper's suggested-bid ranges are on (`faab_suggestions=1`) and every manager sees the same range.
  Sleeper mechanics that bit us: a player locks at kickoff and cannot be benched, dropped or moved to IR until
  the week's games are complete (Tuesday morning PT). Danny hit this Sept 10 trying to IR A.J. Brown after his
  game. IR: 2 slots; Out, Doubtful, NA, DNR, COV qualify (not Suspended).
- **Auto-subs (Sleeper's Player AutoSubs) are on**, per the league settings (researched Sept 11): `max_subs=2` a
  week, `sub_start_time_eligibility=0` (the "Require AutoSub To Not Play Before Starter" toggle is off, so a sub
  may kick off before his starter), `sub_lock_if_starter_active=0` (the sub is released if the starter plays).
  Danny sets one in the Sleeper app (Swap Player → Set an AutoSub): a bench player allowed in the starter's slot who
  is swapped in automatically at the STARTER's kickoff if he is inactive. Both players lock INTO the pair the moment
  EITHER game kicks off, but the swap still fires later: with the start-time toggle off, a sub whose game is already
  over goes in and his points count (Danny corrected this Sept 12; Sleeper added the toggle because some leagues
  objected to exactly that). So an early-window sub is full cover for a night starter, ranked by projection, and the
  pair just has to be set before the earlier kickoff. The public API does not show which subs a
  manager has set (that is the authenticated GraphQL `matchup_legs.subs`), so Danny records his in the app
  (Moves tab → Auto-subs card → kv `subs` via `api/subs`) and the advisor reads the note. Week 1 (Sept 11) he set
  Shakir for Nabers; Shakir kicks off 10 AM PT, Nabers 5:20 PM PT (SNF): full cover, as long as it was set before 10 AM.
- Draft was Tue Sept 8 2026, 7 PM PT, 16 rounds. Danny picked 6, 19, 30, 43, 54, 67, 78, 91, 102, 115,
  126, 139, 150, 163, 174, 187.
- Full notes and the strategy we used: `docs/league-context.md`. Injury flags as of Sept 8 are in
  `app/war-room.html` (Notes tab).

## How Danny wants to be advised
- Superflex first, sized honestly (researched Sept 12 on 2025 data): a QB12–16 in the superflex slot is +4–7
  pts/week over the flex-grade RB/WR he replaces, a QB18–24 +2–4, only a top-8 QB +10. Keep 3 startable QBs
  with different byes; any starting QB on waivers is a priority claim. TEs carry a premium (+0.5/rec): a TE5–12
  scores like a WR20–30, so Danny's two 2025 top-10 TEs are not a weak spot.
- Every playbook rule was researched rule by rule on Sept 12 (verdicts, numbers and sources in
  `docs/playbook.md`; condensed in `lib/rules.js` and the Plan tab). The lineup order is projection → usage
  (targets are stable, TDs are noise) → game environment (implied total, spread) → opponent as a tiebreaker only
  → weather (wind 20+ mph or snow only). The sweep now carries the kickoff, line and weather per player so the
  advisor never searches for them; it searches the opponent's pressure rate only when two options are within 2
  points.
- Be decisive. Headline the single most important move, then a short prioritized list naming the drop for
  every add and the bid for every claim (odd numbers; free-agent adds say "no bid"). Bid sizing follows the
  season plan in `lib/rules.js`: the league-winner reserve (bell-cow job, QB named starter) is $90 through week 4,
  $75 through week 8, $45 after; a proven role change Danny would START $5–13 (up to $20 only against a named
  rival); $15–28 is the dead zone; anyone bound for his bench $1–3 or wait and add free ("$15 is 10% of my full
  season budget" for a bench player, Sept 11); K/DEF $1; hold $20–30 through week 11, keep $5–10 for the week
  15–17 runs. Danny set the core of this Sept 11 after the advisor bid $43 on Kenny Gainwell in week 1 ("rich");
  the decay and dead zone came from the Sept 12 research.
  Flag injuries/suspensions on his own players red/amber/green. For every Questionable starter, name the auto-sub
  to set (the best bench player allowed in the slot, any kickoff, before the earlier kickoff), unless his note says it is set.
- He reads this on his phone. Short beats thorough.

## What's here
- `app/gm.html` — phone app, single file. Tabs: Moves, Roster, News, Ask, Plan. One block is baked in by
  `scripts/build.py` between HTML comment markers: `SWEEP` (JSON from the Python sweep: roster with
  red/amber/green flags, free-agent starting QBs, trending adds that are free agents *here*, league
  transactions with bids, this week's opponent, QB count per team, FAAB left per team). **The baked SWEEP is only the offline fallback**:
  on open, on pull-down and when the app comes back to the foreground, the page fetches `api/sweep`
  (Vercel; the Node sweep, which also carries projections and the lineup math) and, where there is no API
  (GitHub Pages, localhost), talks to api.sleeper.app directly (CORS is open) with the 2.5 MB player feed
  slimmed and cached in localStorage for an hour. Pull-to-refresh is the only manual refresh (no button): the
  page follows the finger, a spinner sits in the gap, and the refresh shows two steps, Sleeper then Claude's
  latest stored read (it never runs the advisor; that is "Re-check now"). `applySweep()` replaces SWEEP, FLAGS
  and the roster. The Plan tab shows FAAB per team, byes ahead and a
  DEF-stream card (this week and next); the Roster tab shows each player's bye.
  The Moves tab shows Claude's latest stored advice from `api/advice` (headline, summary, lineup changes,
  adds with the drop and bid for each, IR moves, auto-subs to set, watch list, player flags), a "Lineup by projections" card (current vs best
  lineup from `SWEEP.lineup`) and an "Auto-subs you've set" card (a note saved to `api/subs`, stale once the week changes); "Re-check now" POSTs `api/advise` with the phone's news log and shows the
  fresh read. Ask POSTs `api/ask` (mode chat) with the news log and the chat turns; the server builds the
  context. The screenshot reader POSTs mode shot with a shrunken JPEG. All of that needs `api/config` to
  report `ask: true`; on the Pages mirror those buttons explain that Claude lives on the Vercel app. The
  alerts card (Moves tab) subscribes the phone to push via `sw.js` + `api/subscribe`, then disappears
  once subscribed (Send test / Turn off move to Plan → Alerts); the install chip nudges Add to Home Screen
  (iOS needs the installed copy for push). The `POOL` array is the draft board's player list.
- `app/sw.js`, `app/manifest.webmanifest`, `app/icons/` — the PWA shell. Network-first cache for our own
  files, never the API. `push` shows the notification, `notificationclick` focuses the app.
- `lib/sleeper.js` — the sweep in Node (same flags and shapes as `scripts/sweep.py`, plus: `proj`
  (this week's Sleeper projection under this league's scoring, TE +0.5/rec), `game` ("Sun vs TB",
  "played", "IN PROGRESS") and `locked` on every player row from Sleeper's undocumented public
  `projections/nfl/{season}/{week}` and `schedule/nfl/regular/{season}` endpoints; `fa_top` (best free
  agents here per position by projection); `transactions[].dropped` (who was let go, `fa` if still
  unowned), `bid`, `note` (Sleeper's reason on a failed claim) and `faab_moved` (budget traded); `lineup`
  (current starters vs the best lineup by projection from `lib/lineup.js`, locked players fixed in place,
  red/Out/Doubtful excluded; `start`/`sit` name the swaps); `faab_total/used/left`, `faab_min_bid`,
  `faab_teams` (every team's budget left in priority order), `waiver_run` (next 12:05 AM Wed PT); every
  free-agent row carries `waivers` (text: on waivers until when) and `claim_at`, or null = add now; every
  row carries `bye`; `byes` (Danny's active players on bye in the next 5 weeks, with a QB count), `qb_byes`,
  `def` (his unit this week and next, best free-agent units for both weeks, from `projections` week+1));
  `auto_subs` (the league's settings plus `at_risk`: each amber starter with the unlocked bench players allowed
  in his slot and whether each kicks off in a later, the same or an EARLIER window); every row carries `date`
  (game date) and, from `lib/games.js`, `kick_pt` (kickoff in PT, also baked into `game`: "Sun 10:00 AM vs TB"),
  `kick_ms`, `window`, `line` ("underdog by 3.5, total 50.5, implied 23.5 (opp 27)"), `env` ("outdoor, wind 6 mph,
  dry, 84°F" or "indoor"), `spread`, `implied`, `opp_implied`, `wind`, plus `vol` (projected targets/carries/pass
  attempts from Sleeper's projection feed). DEF rows carry `opp_implied`, the first filter for a stream.
- `lib/games.js` — the game environment: ESPN's public scoreboard (kickoff, venue and whether it is indoor, the
  DraftKings line, sky and temperature; no key) plus Open-Meteo (wind, gusts, rain chance, snow at kickoff for
  outdoor stadiums; no key; a static table of stadium coordinates and roofs). Best-effort: failures leave nulls.
- `lib/advise.js` — the advisor. `contextText(sweep, {news, prev, notified, reason})` writes the
  situation for Claude, including Danny's auto-sub note (kv `subs`); `runAdvisor()` calls Sonnet with web search (`lib/claude.js`, `lib/rules.js` is
  the playbook), parses the JSON (headline, summary, lineup, adds with how/bid/backup/processes, ir, subs (auto-sub pairings to set), flags, watch, alerts), stores it in
  kv `advice`, and pushes the alerts whose urgency is high or medium. Each alert carries a stable `key`;
  kv `notified` remembers when a key was last pushed (high: not again within 12 h, medium: 72 h, pruned
  after 7 days); at most 4 pushes per run. `dry` skips pushes and storage; `push:false` (on-demand runs
  from the app) stores but never pushes.
- `lib/check.js` — the 15-minute checker. Diffs Danny's roster flags/injuries, his lineup and roster
  edits, new league transactions (`tx_seen`) and new free-agent starting QBs against kv `roster_state`.
  Any change becomes a `reason` and the advisor runs with it (`trigger: "change"`); a red flag on one of
  his starters is also pushed immediately, and if the advisor fails the old raw alerts go out instead.
  First run stores state and sends nothing.
- `api/sweep.js` (GET, CDN-cached 2 min; `?fresh=1` bypasses), `api/config.js` (VAPID public key + last
  check + `ask: true` when the Anthropic key is set), `api/subscribe.js` (POST subscribe/unsubscribe/test;
  subscribe sends a welcome push), `api/check.js` (cron every 15 min; `Authorization: Bearer $CRON_SECRET`;
  `?dry=1` diffs without sending or storing), `api/advise.js` (GET = cron, hourly 6 AM–10 PM PT, same
  auth, `?dry=1`; POST = on-demand from the app, same-origin, body `{news}`, returns the advice, never
  pushes), `api/advice.js` (GET, the stored advice), `api/ask.js` (POST, same-origin; `mode` chat | shot;
  chat gets the advisor's context plus web search), `api/subs.js` (GET the stored auto-sub note; POST same-origin
  `{week, text}` stores it as kv `subs`; the app's Re-check also sends its copy in case that save failed). Daily caps counted in `kv`: `ADVISE_DAILY_CAP`
  (default 40, cron runs excepted), `ASK_DAILY_CAP` (default 60). `lib/http.js` has the shared guards.
  Env on Vercel: `DATABASE_URL` (Neon project `robinsavages`, org "Danny", tables `push_subscriptions` +
  `kv`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `ANTHROPIC_API_KEY`
  (Danny sets it himself; never paste a key into the repo or chat), optional `ASK_MODEL` (default
  `claude-sonnet-5`), `ASK_QUICK_MODEL` (default `claude-haiku-4-5-20251001`). Deps: `web-push`,
  `@neondatabase/serverless`.
- To exercise the sweep and the advisor's context locally without a database:
  `DATABASE_URL='postgres://u:p@127.0.0.1:1/db' node --input-type=module -e '...'` importing from `lib/`
  (the kv counters fail fast and are ignored). To run the real advisor without pushing:
  `curl -H "Authorization: Bearer $CRON_SECRET" "https://robinsavages.vercel.app/api/advise?dry=1"`.
- To test the functions locally: `node --env-file=.env.local <harness>` importing the handlers as Web
  `Request`/`Response`; `vercel env pull` writes `.env.local` (gitignored).
- `app/war-room.html` — the draft-night board (ranked 187 players, tiers, pick plan).
- `scripts/sleeper.py` — stdlib-only Sleeper client. `roster`, `picks`, `transactions`, `players`.
- `scripts/sweep.py` — the Sleeper sweep. Writes `data/sweep.json` + `data/sweep.md`.
- `scripts/build.py` — runs the sweep, injects it into `app/gm.html` in place, and stages `site/`
  (index.html, war-room.html, sweep.json, sw.js, manifest, icons) for Pages and Vercel (`vercel.json`
  runs it with `--no-fetch` as the build command). `--no-fetch` reuses `data/sweep.json`.
- `docs/playbook.md` — researched champions' rules with sources; condensed copies live in `lib/rules.js`
  (what Claude follows) and the Plan tab of `app/gm.html`.
- `.github/workflows/pages.yml` — on push and Tue/Wed/Thu/Sat/Sun 6:30 AM PT: sweep, commit `data/sweep.*`,
  build, deploy Pages.
- `data/sweep.json` + `data/sweep.md` are committed (by the Action); everything else in `data/` and all of
  `site/` is gitignored.

## How the advice loop works (nothing to run by hand)
1. Every 15 min `api/check` rebuilds the sweep and diffs it against the last run. Changes it reacts to:
   a flag or injury change on Danny's player, a change to his lineup or roster, a completed league
   transaction by another team (drops are called out with the player's projection and whether he is
   still unowned and when claims on him process; winning bids are shown), the result of Danny's own claim
   (won or failed, with Sleeper's note), a new free-agent starting QB. Any change runs the advisor with the
   reasons.
2. Hourly 6 AM–10 PM PT `api/advise` runs the advisor anyway, so news Sleeper doesn't show (practice
   reports, role changes, Vegas totals) still gets caught by Claude's web searches.
3. The advisor writes `advice` to kv (what the Moves tab shows) and pushes `alerts` with urgency high or
   medium to Danny's phone, deduplicated by key. Danny can also tap "Re-check now" in the app, which
   includes his pasted news log; that run stores advice but does not push.
4. Cost and time: one advisor run is about 3 minutes and ~140k input / ~14k output tokens plus 5–6 web
   searches (search results are large and count against `max_tokens`, hence the 32k budget), roughly
   $0.60–0.70 per run at Sonnet 5 prices; hourly plus change-triggered runs is on the order of $10–15 a day
   in season. Levers: the cron hours in `vercel.json`, `searches` in `runAdvisor`, `ADVISE_DAILY_CAP` and
   `ASK_DAILY_CAP` (kv counters), Sonnet for advice, Haiku for screenshots. If a search loop leaves no JSON
   the advisor retries once without search (`advice.fallback` says so).
Nice-to-have next: use actual points instead of the projection for players whose game is complete; a
weekly recap after Monday night.

## Conventions
- Python 3.9+, no third-party deps unless there's a good reason. Keep the HTML apps single-file. The Vercel
  side is plain Node ESM (`"type": "module"`), Web-standard handlers, two deps. Anthropic calls go through
  `lib/claude.js` only.
- Secrets live only in Vercel env (and `.env.local`, gitignored). Never commit `.vercel/` or a Neon URL.
- Don't commit `data/*.json`. Don't put anything private in the HTML — the GM app is a hosted page.
- Dates matter: it's the 2026 season. Player-team pairs in the HTML reflect Sept 8 2026 cutdowns.

## Danny's drafted roster (from Sleeper draft picks, Sept 8 2026)
QB Joe Burrow (1.06) · QB Caleb Williams (2.07) · WR A.J. Brown (3.06) · RB Chase Brown (4.07) ·
WR Malik Nabers (5.06, Questionable — knee) · WR Jaylen Waddle (6.07) · RB Quinshon Judkins (7.06) ·
QB Malik Willis (8.07) · RB Jaylen Warren (9.06) · RB Jordan Mason (10.07) · WR Alec Pierce (11.06) ·
TE Juwan Johnson (12.07) · RB MarShawn Lloyd (13.06) · K Ka'imi Fairbairn (14.07) · DEF Detroit (15.06) ·
TE Dalton Schultz (16.07).
Roster as of Sept 12 (the sweep is the source of truth; this is a snapshot): QB Burrow, C. Williams, Willis ·
RB Chase Brown, Warren, Gainwell (claimed week 1), Lloyd, Judkins · WR A.J. Brown (NE), Waddle (DEN), Nabers,
Shakir, Tre Tucker · TE Juwan Johnson · K Fairbairn · DEF Jacksonville. Schultz, Pierce, Mason and the Detroit
DEF are gone. Weak spots: QB3 (Willis shares Burrow's week-6 bye, so he is no cover), no elite RB.
Nabers' Week 1 status was the first thing to check every sweep; the checker now does that itself. Notable league roster facts: TheBigHelmet
(slot 12) has Mahomes + Etienne; EasyIP (slot 1) has Gibbs + McBride + Shough; HappyChappy18 (slot 5, commish)
has Lawrence + Jefferson + Kyren.
