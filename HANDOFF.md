# Make It Count — time-dashboard handoff

Personal single-file HTML time tracker. NOT 32co work. Today = 2026-06-06.

## Files / deploy
- Source (only file edited): `/Users/saurabhmaheshwari/projects/time-dashboard/index.html`
- User views: `cp` source → `~/Desktop/time-dashboard.html`, then `open` it. User looks in their own browser and suggests changes.
- **DO NOT use the preview server** — it's on an isolated filesystem (`/Users/surendra/...`), serves a stale copy, can never reflect edits here.
- localStorage does NOT persist over `file://` for this user → local file runs in **seed mode** (SEED_MONTHS data). Real data only on the deployed site via Firebase sign-in.
- Cache gotcha: plain reload may repaint stale; open under a fresh filename to bust cache for sure.
- Deploy: GitHub Pages, personal acct `26-saurabhmaheshwari`, repo `goal-timer-and-tracker`.
- Push dance (ONLY on explicit y/N): `cp`→Desktop; `git add -A && git commit`; `gh auth switch --user 26-saurabhmaheshwari && gh auth setup-git && git push`; `gh auth switch --user surendrapatel-32co`. No Co-Authored-By.

## Year battery (Overview top KPI) — current design
`yearUsageHTML(o)` ~line 681. 3h/day intentional pool = 1095h (3×365). Battery = 90 cells split into 4 target zones; each zone sized to its target %, colored cells = hours done toward that zone, white = remaining to target. Zone dividers = `.batt-sq i.zsep`.

YTARGETS: Spiritual 40% (#4C6EF5), Youth 40% (#8DC63F), SRM Study 10% src=['Family'] (#F5A623), Career 10% (#5A49B8).

Seed-data trace → 13 colored cells (7 blue, 4 green, 1 orange, 1 indigo). Code verified correct; render mechanism verified working.

## OPEN ISSUE
User reports battery shows "still nothing" (all white) despite verified-correct code + seed data that should yield 13 colored cells. Leading cause: browser cache on user's machine. Last action: opened `~/Desktop/time-dashboard-fresh.html` (new path, zero cache) to confirm cache-vs-bug. **Awaiting user's visual confirmation.**

## PENDING TASK — rename Family → SRM Study (global)
User created "SRM Study" category in-app; wants Family renamed to it and ALL Family data migrated in.
- Code seeds to update: SEED_COLORS, SEED_MONTHS, SEED_ALLCATS (`['Spiritual','Youth','Family','Career','Hobby']`), SEED_TASK_CAT (`'SRM-Play':'Family','SRM-20':'Family'`), YTARGETS src.
- Add idempotent boot migration over localStorage/Firebase-hydrated data: rename `cat:'Family'`→`'SRM Study'` across entries (`ptd_entries_v1`, keyed `e.cat`), MONTHS cats, goals (LS_GOALS), TASK_CAT values, COLORS keys, ALLCATS. **Merge** if 'SRM Study' already exists. Must run after Firebase `applyBlob` (~line 1669) hydration too.

## Code map (index.html)
- Data layer ~590-632: SEED_COLORS(595), SEED_MONTHS(598), SEED_ALLCATS(617), SEED_TASK_CAT(618), COLORS/ALLCATS/TASK_CAT loaders.
- `monthCats(M)` ~616 → minutes/cat. `entryCats(ym)` ~762 (entries keyed `e.cat`).
- `renderKPIs` ~640-680 writes `#kpis` innerHTML once.
- Entry shape: `{ym, period, cat, mins}`. loadEntries/saveEntries ~1005-1006 (saveEntries calls fbSyncPush).
- loadGoals/saveGoals ~1414-1415. applyBlob ~1669 (sets LS_MONTHS/COLORS/ALLCATS/TASKCAT from Firebase).
- Battery CSS ~105-110: `.batt-sq`, `.batt-sq i`, `i.empty` (white), `i.zsep` (divider). `.batt-cells` (~line 849) = SEPARATE free-time battery, not the year one.
- Never change Firestore Security Rules (access control) — user pastes those themselves.
