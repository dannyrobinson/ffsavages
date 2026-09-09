# robinsavages

Danny's fantasy football GM kit for the West Van Super Studs (Sleeper, 2026, superflex PPR).

**App:** https://dannyrobinson.github.io/ffsavages/ (rebuilds itself from Sleeper on push and five mornings a week)

    python3 scripts/sweep.py       # what Sleeper says right now: roster flags, free-agent QBs, trending adds, opponent
    python3 scripts/build.py       # sweep + bake docs/briefing.md into app/gm.html, stage site/
    claude                         # open Claude Code; CLAUDE.md has the plan and the refresh routine

- `app/gm.html` — phone GM app: Moves, Roster, News, Ask, Plan (champions' playbook)
- `app/war-room.html` — draft-night board
- `scripts/` — `sleeper.py` client, `sweep.py`, `build.py` (stdlib only)
- `docs/` — `league-context.md`, `briefing.md` (Claude's current briefing), `playbook.md` (researched rules + sources)
