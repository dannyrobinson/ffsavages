# Champions' playbook

In-season rules for Danny's superflex team, with the evidence behind each one. First researched Sept 9, 2026;
every rule was then re-researched one by one on Sept 12, 2026 (four parallel research passes, sources at the
bottom), and the numbers below are what that research found. Dollar figures are scaled to Danny's $150 FAAB.
The condensed version of this is baked into `app/gm.html` (Plan tab) and into `lib/rules.js`, the rules Claude
follows when it advises. Verdicts: **supported**, **partly** (kept with a changed number or caveat),
**contradicted** (replaced).

## 1. Waiver wire / FAAB
Sleeper mechanics in this league (support.sleeper.com, checked Sept 11–12 2026 against the 2025 league's transaction log):
- $150 for the season, blind bids in whole dollars, minimum $1, highest bid wins; Sleeper processes the league's claims
  from the highest bid down, **league-wide by amount** (so a $5 backup runs after every rival's $6+ claim). Equal bids
  go to waiver priority, which rolls: winning a waiver claim sends you to 12th, free-agent adds don't move it.
- The weekly run is 12:05 AM PT Wednesday ("Tue After Day"). A free agent locks at his own kickoff and sits on waivers
  until that run, so Sunday night to Wednesday everybody who played is a claim, not an add. A player on bye or in the
  Monday game is still a free add on Sunday night. Anything wanted for a Thursday game is a Wednesday add.
- A dropped player sits on waivers 48 hours and the claims on him process exactly then, at that hour on any day.
- Several claims can be entered; a later claim naming the same drop as one that already won fails harmlessly (Sleeper
  rejects a bid whose drop was already dropped by an earlier winning bid, even with an open roster spot), so a backup
  claim = same drop as the main claim, at a **lower** bid. Sleeper only lets you reorder claims with equal bids.
- Sleeper shows every manager the same suggested bid range ("FAAB suggestions" is on). The support article gives no
  methodology, so read it only as the anchor rivals see. FAAB can be included in trades.
- **Danny's season plan (Sept 11 2026, after the advisor bid $43 on a committee back in week 1):** the $150 is for the
  one or two league-winners a season. Real money only for a player who will start for Danny; anyone bound for the
  bench is $1–3 or wait and add free; "$15 is 10% of the season and no bench player is worth it".

Rules, with verdicts:
- **Reserve for a league-winner (partly).** 4for4 2025–26: spend 40–60% "without flinching", 75–80% for a top-10
  asset; "a dollar in week 2 buys fifteen weeks of a player, in week 12 five". FantasyPros' 600k-add dataset: the
  splashes that paid were 30–60% of budget. Two to four such events appear league-wide a season (2025: Dowdle,
  Gainwell, Stafford; 2024: Irving, Chase Brown, Nix). So: keep **$90 through week 4, $75 through week 8, $45 after**;
  bid $60–90, up to $112–120. Any bid over $15 passes the three Ps: Path (job is his now), Permanence (4+ weeks),
  Price (the second-highest bid).
- **Tier 2, a player Danny starts now: $5–13, up to $20 only when a named rival needs the slot (partly).** Expert
  guidance runs 15–30% for a weekly starter, but observed winning medians are 2–3% and 10–19% bids were the "dead
  zone" that "rarely returned winning production". **$15–28 is the dead zone**: a player who seems worth it is tier 1
  or tier 3.
- **Tier 3 bench players $1–3 or free; K/DEF/fill-ins $1 (supported).** 4for4 2026: "never more than $2 on a defense,
  any week, any matchup".
- **Weeks 1–3 are inflated (partly).** The week-1 median winning bid was *lower* than the season's, but the tail was
  extreme (a 77% bid). Only 13% of week-1 late-round breakouts finish top-12; 33% of week-1 disappointments still do.
  Bid the tier, not the moment; expect a tier-1 winner to land above Sleeper's suggested range.
- **Endgame (partly).** Hold $20–30 through the week-11 run. From the week-12 run, if in the playoffs, spend on the
  first starter-grade need but keep $5–10 for the week 15–17 runs (a semifinal injury replacement); if eliminated the
  budget is worth nothing.
- **Odd bids, never tie, rival-balance + 1 (supported as consensus; clustering itself unpublished).** Danny's priority
  is mid-pack, so a tie is a coin flip; with the most budget left, highest rival balance + 1 is unbeatable.
- **Waiver priority is an asset (new).** A won claim, even for $1, sends you to 12th. Add a player nobody will bid on
  free after the run; claim only when a rival plausibly bids.
- **Handcuffs (partly).** Only 8 of 71 first-round-RB handcuffs since 2010 finished top-24 (11%), yet 2.5 top-12 RBs a
  season come from non-lead backs and top-24 RBs miss ~2.4 games each. Handcuff only Danny's own RB1s and the
  next-man-up behind fragile bell-cows in good offences; from week 10 a handcuff earns a bench spot.
- **Cut on a trend, not a box score (partly).** Two or three games of falling snaps or routes; three weeks of rising
  usage is a real role; 70%+ snap share produces at twice the rate of sub-50%.
- **Injured stashes (new).** Claim a rival's dropped Out/IR starter who returns by week 12 for $1–3 and park him on
  IR (the claim still needs a roster spot when it processes; the IR move comes after).
- **FAAB as trade currency (new).** Its trade value dies at the week-10 deadline: in weeks 8–10, with $90+ left and no
  league-winner in sight, $10–25 of it sweetens a starting-nine upgrade; buy budget cheaply from teams out of the race.

## 2. Superflex and TE
- **A starting QB is worth ~10 points over a flex (partly: overstated).** 2025 per game (4-pt pass TD): QB12–16
  scored 15–17, QB18–24 12–15, against 10–11 for the RB25–35 / WR30–40 a manager would flex. So a mid QB is a 4–7
  point edge, a low-end starter 2–4, and only a top-8 QB is +10. Price claims and trades to that gap.
- **Carry exactly three startable QBs (supported), with three different byes (new).** A QB3 who shares a bye with a
  starter is a bench flex with a QB label. Any QB who becomes a starter is a priority claim. Sell a spare during QB
  byes or after a rival's QB injury; two-QB teams are the buyers.
- **TE premium (supported).** With +0.5/rec a TE5–12 scored 12–14 a game in 2025, the WR20–30 band; the TE1 is a WR1.
  A TE with 5+ targets belongs in FLEX over a WR3/RB3; never trade a top-10 TE for a WR3.
- **Two QBs on one bye (partly: size overstated).** The hole is the QB-vs-flex gap (3–6), but every superflex roster
  whose QB is off that week hunts the same streamers. Claim a QB with a different bye two runs ahead, $1–3.

## 3. Lineup decisions
- **Volume over talent (supported, threshold refined).** Targets per game are the stickiest stat (year over year
  r ≈ 0.70; TD rate 0.19, contested-catch rate 0.02). 8+ targets is WR2 volume (~14–16 PPR points at 1.8–2.0 per
  target), not a floor; 6 or fewer is a prayer. Route participation: top-12 WRs run 84% of routes, TE1s 77%, RB1s ~50%;
  under 75% (WR) or 40% snaps (RB) is bench-only, and a jump to 80%+ is the earliest start signal.
- **Vegas over defensive rankings (supported in direction; "not" too strong).** Implied totals track scoring almost
  1:1. Defensive rank is a small real term: ~0.1 point per rank for RBs (best-vs-worst ≈ 4 points), less for QB/WR,
  nothing for TEs. Fantasy points allowed to a position repeats year to year at r = 0.27 (QB), 0.22 (RB), 0.16 (TE),
  so it is noise before week 5. Run/pass "funnels" have no backtest; treat as hunches.
- **Start studs; matchups break ties (supported).** A matchup moves a player 1–4 points, the offence 2–4× that. The one
  matchup that benches a WR is a named elite shadow corner (≈ −39% in Ramsey-type games).
- **Game script (new).** Once the spread passes 2.5, favourites' players score more at every position (WRs +42 yards,
  RBs +27); the RB share of yards barely changes by script (33.5% vs 34%), so "pick the favourite's players" beats the
  narrative. Only a 7+ point underdog nudges its RB down and its pass-catchers up. PROE is reliable from week 4; pace
  only matters for the three fastest and slowest teams.
- **Pressure (new).** Clean pocket +0.225 EPA/play vs −0.331 under pressure; QB/WR/TE score ~60% more per clean
  dropback. Against a top-5 pressure defence drop a pocket QB and his deep/perimeter WRs half a tier; hold the slot WR
  and the pass-catching RB; leave a scrambler alone.
- **Questionable 71% / Doubtful 7% (supported; refreshed).** Footballguys 2017–24 (2,000+ injuries): Questionable
  played 70.7%, Doubtful 6.9%. Last practice day: full ≈ 86%, limited ≈ 71%, DNP ≈ 42%. A DNP-LP-FP week is a start;
  three DNPs is a coin flip.
- **Late-window Questionable needs a backup (supported, but the backup is the auto-sub, whatever his kickoff).**
  Inactives land ~90 minutes before kickoff, after every early-window bench player has locked, so a manual pivot is
  impossible. Sleeper's AutoSub fires at the starter's kickoff, and because this league leaves "Require AutoSub To
  Not Play Before Starter" off, a sub whose game is already over still goes in and his points count (Sleeper added
  that toggle because some leagues objected to "swapping out a 4pm player for a 1pm player who already played").
  So: set an auto-sub for every Questionable starter, ranked by projection, before the earlier of the two kickoffs;
  Danny's week-1 pair (Shakir 10 AM for Nabers 5:20 PM) is full cover. Danny corrected our earlier reading on Sept 12.
- **Only wind matters (partly).** Below 20 mph there is no measurable shift; at 20+ (3.7% of games) completions fall
  ~5 points, deep passes and field goals fall off (FG% −6–7), and ~8% more targets go to RBs; mobile QBs hold up.
  Snow: −7% completions, −110 pass yards, QB ≈ −4.4 expected points, RB +4.3. Rain: −3% completions, −2 attempts,
  +15 rush yards. Cold, heat and roofs wash out once team quality is controlled. So: **wind 20+ or snow changes a
  start; rain is minor; cold, heat, domes, turf are noise.** Home is worth ~1 point to a QB and 0.5 to a K; Thursday
  costs a QB ~1 and never his RB; body clock, altitude (except +5 yards of FG range in Denver) and turf: ignore.
- **Projections as baseline (supported); room RB1 beats a low projection (partly).** Consensus projections beat almost
  every individual; weekly sets are re-cut Tuesday and Friday, so a promotion from the last 1–3 days lags. A player
  who has been RB1 on the chart for a week or more with a low projection is in a committee, and the projection is right.
- **QB change / O-line (new).** Backups average 14.2 a game; target hogs keep volume, deep and perimeter WRs lose
  efficiency. Line quality correlates with RB points (adjusted line yards r = 0.43) but the *count* of injured starters
  does not (0.04): downgrade only with 2+ out and yards before contact already down.
- **TD regression (new).** Expected TDs are stickier than actual (0.38 vs 0.28); 91% of positive-differential players
  scored fewer the next year. Project TDs from red-zone and end-zone share; never bench volume for "regression".
- **Stacking (new, tiebreaker only).** QB–WR correlation 0.31; a stack adds ~1.8 to the weekly ceiling and costs ~1.6
  of floor, nothing over a season. Stack when the underdog, uncorrelate when the favourite; never pay for it.
- **Returns and byes (new).** WRs back from a high-ankle sprain missed their prior level 68% of the time in game one;
  QBs improve 5.5% after a bye (top-12 QBs 10%).
- **Points-for tiebreak (new).** Sleeper seeds by record, then points for: start the max-projection lineup every week.

## 4. Trading
- Trade for lineup improvement: "does this raise my starting nine?" (supported).
- 2-for-1 offers trigger suspicion; package two for their star plus their lowest-value player (supported).
- **Buy usage, sell TDs (supported; now quantitative).** Year over year, targets/game r = 0.70 and carries 0.65, but
  TD/game 0.37 and RB red-zone TD rate 0.06; 89% of 10+ TD seasons drop the next year (−5.2 TDs on average). Buy a
  player whose targets or carries rose before the points did; sell one whose TDs run ahead of red-zone touches.
- Target 0–3 teams, positional gluts, frustrated managers; firm opening offers; nothing in league chat (supported).
- **Window weeks 5–10 (supported).** Best prices the week before a rival's bye cluster and within 24 h of an injury.
- **Playoff byes (new).** Weeks 13 (BAL, IND, LV, NYJ) and 14 (ARI, DAL) fall inside this league's two-week rounds:
  discount those players in trades and never use them as QB3, K, DEF or streamers for the playoffs.

## 5. Playoff planning
- **This league:** 6 teams, playoffs start week 12 with two-week rounds (12–13, 14–15, 16–17); 11 regular-season
  weeks; deadline week 10.
- **Playoff schedule as tiebreaker (partly: week 5 too early).** Defences repeat at r ≈ 0.2 and preseason strength of
  schedule is "mostly useless"; schedule-adjusted points allowed needs ~10 weeks. Use it only from week 8, only as a
  tiebreaker, with adjusted data.
- **"Lock a playoff DEF by week 10" (contradicted).** Streaming beats holding (section 6). By week 10 shortlist 2–3
  units with the lowest opponent implied totals in weeks 12–17 and keep streaming among them.
- Handcuffs for Danny's own RBs and a QB3 whose bye is not week 13 or 14 by week 10 (supported).
- **Short weeks (new).** Week 16 has a Friday Christmas tripleheader and weeks 16–17 have Saturday games: inactives
  lock early, so late-window or Questionable players go in FLEX where a replacement can slot in. In a two-week round
  prefer floor when leading after week one, ceiling when trailing.

## 6. DEF and K
- **Stream (supported).** The five best-matchup D/STs averaged 10.4 a week vs 9.6 for the season's top five, a ≥1
  point gap in each of the last four seasons; the first five D/STs drafted in 2025 finished 27th, 16th, 10th, 21st and
  18th. Rank by the opponent's implied total (under 20 target, under 18 jackpot), then opponent sacks and pressures
  allowed, an INT-prone, backup or rookie QB, then home favourite; ignore the defence's own rank and last week's
  turnovers (not sticky). Add next week's stream at the Wednesday run for $1 or free; a Thursday-night unit is a
  Wednesday add; holding a unit 2–3 weeks is fine when its schedule lines up.
- **K (new).** Implied total 27+ more than doubles 10-point games; dome 8.7 vs outdoor 8.3, 20+ mph wind 7.7, home
  +0.5; year-to-year kicker rank is "basically insignificant". Stream for $1 or free.
- **A stream replaces a bad matchup; it never chases a small edge (Danny, Sept 12).** The advisor once proposed dropping
  Fairbairn (97% rostered, Sleeper's K4) for Matt Gay (13%, K20) for +0.8 projected points. Never drop a K or DEF for a
  projected gain under 2 points, and hold a unit Sleeper ranks top-5 at the position through ordinary weeks; swap only
  for a bye, an injury, an implied total that makes the week bad (under 20 for the offence, over 26 for a DEF's
  opponent) or 20+ mph wind. The dropped unit is gone for good; the projection edge is noise.

## 7. Mindset / process
- Season-long fantasy is roughly 80% luck / 20% skill: grade decisions by process (supported).
- React to usage, not box scores (supported; usage repeats at r ≈ 0.7, TDs and efficiency do not).
- Three news passes: Tuesday (waivers), Friday (final designations), 90 minutes before each kickoff.
- **IR nuance (partly).** A season-ender goes to an open IR slot and is dropped only when both slots are needed for
  players back by week 17; never drop an IR-eligible player who returns this season. No loyalty to draft capital.

## Data the app now carries for these rules
`lib/games.js` adds, for every player's game: kickoff in Pacific time and its window (auto-sub pairings), the
DraftKings line from ESPN's public scoreboard with both implied totals (game environment, DEF and K streaming), the
roof, and Open-Meteo wind, gusts, rain chance and snow at kickoff for outdoor stadiums (weather). Sleeper's projection
feed already carries projected targets, carries and pass attempts, shown as each player's volume.

## Sources
Sleeper mechanics
- https://support.sleeper.com/en/articles/1876040-how-does-faab-bidding-work — blind bids, rolling priority, reordering only among equal bids.
- https://support.sleeper.com/en/articles/9657110-how-do-faab-and-waivers-work — claims processed highest bid first.
- https://support.sleeper.com/en/articles/3978623-why-was-my-waiver-claim-invalid — same-drop backup claims fail harmlessly.
- https://support.sleeper.com/en/articles/3978868-waivers-for-regular-season-playoffs — locks at kickoff, "Tue After Day", Thursday players, 2-day clearing.
- https://support.sleeper.com/en/articles/12111984-suggested-faab-bids — the suggested-bid range (no methodology).
- https://support.sleeper.com/en/articles/4238872-can-i-set-tiebreakers — seeding: record, points for, points against.
- https://support.sleeper.com/en/articles/9731991-how-does-player-autosubs-work · https://sleeper.com/topic/170000000000000000/1129162286456852480 — AutoSubs: the swap fires at the starter's kickoff; the start-time toggle (off here) exists because early-game subs who already played otherwise count.

FAAB
- https://www.4for4.com/2025/preseason/ultimate-guide-waiver-wire-faab-strategy-2025 — bid sizing, odd bids, Irving/Kyren championship-roster rates.
- https://www.4for4.com/2026/preseason/ultimate-guide-winning-waiver-wire-2026 — depreciation, three Ps, $1–2 on DEF, IR slots as free spots.
- https://www.fantasypros.com/2025/09/fantasy-football-waiver-wire-pickups-win-championships/ — 600k-add dataset: medians, the 10–19% dead zone, week-1 tail.
- https://www.fantasypros.com/2025/09/fantasy-football-faab-waiver-wire-strategy-advice/ — $0 on D/K, FAAB depreciation.
- https://scoutcast.ai/blog/what-is-faab-in-fantasy-football/ — tier percentages, hold 50–60% through the first month.
- https://www.cbssports.com/fantasy/football/news/fantasy-football-all-waivers-team-2025/ — how many league-winners appear a season.
- https://www.sharpfootballanalysis.com/fantasy/fantasy-football-handcuff-history-cheap-rb1s-and-ambiguous-backfields/ — handcuff hit rates since 2010.
- https://rotobanter.beehiiv.com/p/are-running-backs-more-injury-prone-than-receivers — games missed by top-24 RBs.
- https://fantasywaiverwizard.com/learn/understanding-usage-data — weeks of usage before cutting or trusting a role.
- https://www.thefantasyfootballers.com/articles/fantasy-football-dont-overreact-to-week-1-unless/ — week-1 breakout and disappointment base rates.
- https://www.footballnationusa.com/post/what-is-ir-spot-in-fantasy-football — IR-slot use in redraft.

Superflex and TE
- https://www.fantasypros.com/nfl/stats/qb.php?year=2025 · https://www.fantasypros.com/nfl/stats/rb.php?year=2025&scoring=PPR · https://www.fantasypros.com/nfl/stats/wr.php?year=2025&scoring=PPR · https://www.fantasypros.com/nfl/stats/te.php?year=2025&scoring=PPR — 2025 per-game figures behind the QB and TE gaps.
- https://www.fantasypros.com/2026/08/superflex-fantasy-football-draft-strategy-qb2-targets-2026/ — three or four QBs, QB replacement value.
- https://fantasywaiverwizard.com/learn/superflex-strategy — three-QB rule, QB trade timing.
- https://www.fantasypros.com/2025/06/fantasy-football-draft-strategy-tight-end-premium-te/ — TE-premium shift.
- https://lordskunk.com/guides/superflex-qb-strategy-2026/ — shared-bye handling.

Lineups
- https://www.4for4.com/2024/preseason/most-predictable-wide-receiver-stats — targets/game r = 0.70 year over year.
- https://www.sharpfootballanalysis.com/fantasy/wide-receiver-stats-that-matter-fantasy-football-2024/ — within-season vs year-over-year stability of targets, yards, TDs.
- https://www.fantasylife.com/articles/fantasy/what-is-route-participation — route-participation benchmarks by position.
- https://fantasystrategyguide.com/snap-count-analysis — snap-share production rates and the two-week role-change signal.
- https://www.thefantasyfootballers.com/articles/the-fantasy-football-mythbusters-making-the-most-of-matchups/ — per-rank effect of offence vs defence, 2005+ regression.
- https://www.4for4.com/2026/preseason/do-defenses-repeat-fantasy-football-performances — points allowed repeats at r 0.16–0.27.
- https://www.nbcsports.com/fantasy/football/news/the-funnel-defense-report-week-1 · https://www.pff.com/news/fantasy-football-pass-run-funnel-report-defenses-to-exploit-in-week-10 — funnel reports, no backtest.
- https://www.pff.com/news/fantasy-football-metrics-that-matter-shadow-corners · https://www.fantasypoints.com/nfl/articles/2021/which-cbwr-shadow-matchups-actually-matter — shadow corners.
- https://www.thefantasyfootballers.com/articles/the-fantasy-football-mythbusters-flip-the-game-script/ — favourites vs underdogs 2000–2020, RB share by script.
- https://establishtherun.com/pass-rate-over-expectation/ · https://www.thefantasyfootballers.com/analysis/pace-of-play-why-it-matters-for-start-sit-decisions/ — PROE stability, pace.
- https://www.pff.com/news/nfl-pff-signature-stat-spotlight-quarterback-pressures · https://arxiv.org/pdf/2305.10262 — pressure EPA, pressure-rate stability.
- https://www.footballguys.com/article/2025-chance-to-play-questionable-vs-doubtful — Questionable 70.7%, Doubtful 6.9% (2017–24).
- https://www.footballoutsiders.com/stat-analysis/2018/questionable-behavior — last-practice-day play rates (full 86 / limited 71 / DNP 42).
- https://www.fantasylife.com/articles/best-ball/does-wind-matter-in-fantasy-football — 1,311 games 2018–22, the 20 mph threshold.
- https://www.thespax.com/nfl/analyzing-the-effect-of-weather-in-the-nfl/ · https://www.4for4.com/2018/preseason/weather-effects-and-fantasy-football-part-1 — completions, deep passes, FG% by wind.
- https://www.thefantasyfootballers.com/articles/the-fantasy-football-mythbusters-whether-weather-really-matters/ — rain, snow, cold and domes with team quality controlled.
- https://www.sharpfootballanalysis.com/sportsbook/weather-impact-on-nfl-betting/ · https://www.covers.com/nfl/how-weather-affects-betting — kicker accuracy by wind.
- https://www.pff.com/news/fantasy-football-narrative-street-how-significant-are-homeaway-splits · https://www.pff.com/news/fantasy-football-the-factors-week-3-2017 · https://www.fantasylabs.com/articles/to-fade-or-not-to-fade-the-thursday-night-conundrum/ — home/away and Thursday effects.
- https://ftnfantasy.com/nfl/the-backup-qb-chronicles · https://www.pff.com/news/fantasy-football-how-do-backup-qbs-affect-skill-player-production — backup QBs.
- https://www.4for4.com/2026/preseason/how-offensive-line-play-impacts-fantasy-football — line quality vs injured-starter count.
- https://www.pff.com/news/fantasy-football-metrics-that-matter-touchdown-efficiency · https://www.fanduel.com/research/touchdown-regression-what-it-is-and-how-to-use-it-for-player-prop-bets-fantasy-football — expected TDs and regression.
- https://www.rotowire.com/football/article/does-stacking-work-in-fantasy-football-what-four-years-of-data-say-about-drafting-correlated-players-2026-131409 — stack correlations 2022–25.
- https://www.thefantasyfootballers.com/articles/high-ankle-sprains-their-effect-on-fantasy-performance-fantasy-football/ · https://www.draftsharks.com/article/do-players-perform-better-after-a-bye-week- — injury returns, post-bye bumps.
- https://www.fantasypros.com/2026/01/2025-fantasy-football-rankings-most-accurate-experts/ · https://fantasyanalyst.substack.com/p/2026-fantasy-football-nfl-depth-charts-b98 — consensus accuracy, Tuesday/Friday projection cadence.

Trades and playoffs
- https://www.footballguys.com/article/2023-ultimate-guide-to-trades — consolidation, negotiation, timing around byes and injuries.
- https://www.4for4.com/2023/preseason/most-predictable-running-back-stats — targets/carries vs TDs year over year.
- https://sports.yahoo.com/articles/trade-fantasy-football-recognize-indicators-005347078.html — the weeks 5–10 window, 24-hour counteroffers.
- https://www.si.com/fantasy/2025-nfl-schedule-release-will-be-mostly-useless-in-fantasy-football-drafts-01jv2f3v5frm · https://fantasyindex.com/2025/11/06/scheduletron/defensive-strength-of-schedule — playoff SOS reliability.
- https://www.nfl.com/news/2026-nfl-schedule-release-every-team-bye-week · https://www.nfl.com/news/christmas-netflix-2026-nfl-schedule-release — byes in weeks 13–14, the week-16 Friday games.
- https://www.espn.com/fantasy/football/story/_/id/47023923/fantasy-football-playoffs-tips-strategy-pickups · https://www.rotowire.com/football/article/strategy-for-fantasy-football-playoffs-100437 — playoff-round tactics.

DEF and K
- https://www.espn.com/fantasy/football/story/_/id/49798496/2026-fantasy-football-d-st-road-map-early-season · https://www.espn.com/fantasy/football/story/_/id/46050621/2025-fantasy-football-streaming-defense-d-st-strategy-matchups — streaming vs holding, four seasons.
- https://subvertadown.com/article/what-goes-into-the-d-st-model- · https://www.draftsharks.com/article/streaming-defense · https://www.stokastic.com/articles/nfl-dfs/nfl-dfs-defense-strategy — the D/ST signals in order.
- https://www.pff.com/news/fantasy-football-metrics-that-matter-kickers · https://sports.yahoo.com/stop-hating-on-fantasy-football-kickers--heres-why-its-not-a-random-position-165025064.html — kicker drivers.

Process
- https://www.alexcates.com/post/luck-vs-skill-how-much-does-luck-matter-in-season-long-fantasy-football — 80/20 luck-skill study.
- https://www.si.com/onsi/fantasy/nfl/2025-fantasy-football-waivers-trades-weekly-lineup-mastery — lineup-vs-roster trade test.
