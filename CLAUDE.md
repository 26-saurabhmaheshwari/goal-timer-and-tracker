# time-dashboard ("Tenfold")

Single-file personal time/goal/habit dashboard. **The entire app is `index.html`** (~3400 lines, embedded CSS + JS, Chart.js). Runs from `file://`, deploys as one file to GitHub Pages.

Feature history + design decisions live in **NOTES.md** — read the relevant section only when touching that feature (portal skin #44–#50, exports, pledge/poster/witness/letter/journey/pot/reports details, mini↔top-level convert, 4-tier restructure).

## Hard constraints (violating these breaks things)
- **Never split `index.html`.** It's the source of truth the user edits on `file://` — no build step.
- **Never use a preview server / headless Chrome** to render it. The user eyeballs on `file://` and reports back.
- **Never touch Firestore Security Rules** (user pastes manually). No sign-in allowlist — per-user isolation is Rules-enforced.
- **FILE MAP comment at top of file**: NO nested `-->` (breaks the whole page).
- **Don't touch the Overview tab's internal content** — only the shell around it.
- GoalsOnTrack skin: recreate graphics as ORIGINAL inline SVG/CSS; never embed their image bytes (public GH Pages).
- Edit > Write. Don't re-read the whole file to verify an edit.
- After any JS edit run `node test.js` (syntax + invariant guards), then tell the user to eyeball on `file://`. (Node v24 present; if shell can't find `node`, refresh PATH from Machine+User env.)

## Deploy / push dance
Repo `goal-timer-and-tracker`, account `26-saurabhmaheshwari`, branch **`master`**. Push ONLY on explicit "push"/"psuh"/"push now". `gh auth switch` alone doesn't work (Windows Credential Manager shadows it; `gh auth setup-git` needs /dev/tty). Working sequence — commit first (plain `git commit`), then:
```
gh auth switch --user 26-saurabhmaheshwari
git -C D:/goal-timer-and-tracker -c credential.helper= \
  -c credential.helper='!f() { echo username=26-saurabhmaheshwari; echo "password=$(gh auth token)"; }; f' \
  push origin master
gh auth switch --user surendrapatel-32co   # always switch back
```

## State model (the recurring bug classes)
Persisted state = `LS_*` localStorage keys + in-memory mirrors (`COLORS`, `ICONS`, `ALLCATS`, ...). Firestore overrides localStorage when signed in.
- **Merge precedence**: startup merge MUST be `{...SEED, ...loadObj(KEY,{})}` — user values override seeds. Reverse order silently reverts user edits. test.js guards this.
- **Don't cache `loadEntries()` in a module var** — callers mutate in place and `applyBlob` writes `LS_KEY` directly; a shared cache leaks/goes stale. Parse-per-paint is fine (dataset tiny). Rejected 2026-07.
- **New persisted state**: `LS_<NAME>` const + seed/load/save helpers + persist fn (`localStorage.setItem` + `fbSyncPush()`), AND one row in `SYNC_FIELDS` `[blobField, lsKey, liveGetter, mergeStrategy]` — that wires cloud push/restore AND backup export/import. test.js asserts every `LS_*` is in SYNC_FIELDS or exempt. dob/name/target/planwin/lifebar are inline scalar specials; `LS_VIEW`/`LS_ONBOARDED` deliberately unsynced.
- **Sync merge**: cloud pull = `applyBlob(d,true)` per-field merge; file import = `applyBlob(d)` wholesale replace. Strategies: `'id'` union-by-id cloud-wins (entries, goals), `'map'` `{...local,...cloud}`, `'union'` dedupe-append, `'replace'` cloud wins. Map/union read the in-memory mirror via `liveGetter`, not localStorage. No tombstones — a delete can reappear from the other device (accepted).
- **Category data is Settings-driven, never hardcoded** (`ALLCATS`/`COLORS`/`ICONS` via `iconFor()`/`colorFor()`). Planning rows are ALLCATS-driven (`planYearTotals()`); never reintroduce a hardcoded target list.
- **Seeds are neutral, not personal** — generic starter data, `SEED_YR=CUR_YM.slice(0,4)`, never a hardcoded year or religious/personal content. Onboarding = `#onboard` banner gated by `maybeShowOnboard()`.

## Goal model invariants
- `sec` 4-tier: `'active'` = **Live Nuggets** (cap 5, the ONLY tier in planning/pace math — sites test `sec==='active'` or, where minis count, `loggableGoals()`; see Minis below), `'progress'` = **This Quarter** (cap 11) — NO LONGER a top-level card; renders as the `🗓 This Quarter` subcard *inside* the Yearly card (like `🔁 Recurring`), and its hours/count roll INTO the Yearly bar (`tierHours('yearly')` and `yCount` add `progress`). `'yearly'` = **Yearly** (cap 21, the master total = yearly+progress+recurring), anything else = **Someday** (legacy backlog/dream fall through). **Tier is auto-derived, not picked**: the goal form has a "Live Nugget" checkbox (`gNug`) — checked → `sec='active'`, deadline cleared, `start`=current-period start; unchecked → `sec=tierFromDeadline(by)` (this quarter→progress, later this year→yearly, next-year+/none→someday). Only the `active` cap hard-blocks in goalForm submit now (Quarterly/Yearly auto-fill, can overflow); minis exempt. Existing goals re-sort only when edited+saved (no silent load-time migration). Per-category nugget quota `LS_QUOTA` = soft-warn only. Logged time ALWAYS counts toward totals regardless of tier.
- **All progress goes through `addGoalProgress(g,x,amt,ym,period,extraLog)`** — bumps `cur`, pushes `goal.logs[]` row, writes the time entry. Never re-implement it (log would under-count).
- **Display/math paths use `goalsLive()`** (filters `deleted`); save/lookup paths use `loadGoals()` so trashed goals survive round-trips.
- **Minis** (`parentId` set, one level only): progress echoes to parent (`cur+=amt` + `{via:name}` log row, NO second time entry). Any new form-open path must go through `goalFormReset()`. Mini time-mapping (`gMinPer`) is locked in the form — inherited from parent, not editable.
  - **Minis ARE nuggets** (2026-07): the **Live Nuggets tier** (card, cap/count, pace/target stats, tier-hours bar, period sheet, audit) uses `loggableGoals()` — an active parent is replaced by its active minis, and an active mini of a non-active parent stands alone. So active minis show as full nugget cards (via `goalLabelHtml`) and count toward the period target. NO double-count with pace (only `sec==='active'`/loggable feeds daily pace; the parent's own tier bar can visually overlap since mini progress echoes up — accepted).
  - **Other tiers** (`progress`/`yearly`/`someday`) aggregates still filter `!g.parentId` — a mini only surfaces as a nugget, plus a slim nested row inside its parent's card.
- Done = `goal.done`; soft-delete = `goal.deleted`/`deletedAt` (trash in `#secTrash`); pledge = `goal.commit`; per-goal log = `goal.logs[]` — all ride `LS_GOALS`, no new keys.
- Planning window = user-set `LS_PLANWIN` (default 210, snapped to 10-day periods), inline-special sync field. `pend` (days left) still drives per-day math — intentional.

## Layout conventions
- Modal: `.modal-ov` overlay + `.card.modal-card` via `hidden`; modal form anatomy scoped to `.modal-card .form` (don't leak to period/commit modals' `.perow`/`.frow`).
- Period-entry + pledge modals use one-line `.perow` rows — don't reintroduce 2-line `.frow` there.
- Sidebar nav `#sidebar` + page header `#pgTitle`/`.ph-right` (per-view actions toggled in `setView`). Views: `overview/log/goals/planning/reports/settings`; Audit rides Log, FAQ rides Settings, Pot is an Overview sub-tab (`ovTab`). `setView()` remaps stale `LS_VIEW` values.
- PDF export = `window.print()` + `@media print`; exactly three export surfaces (Reports button, period-modal footer, Settings backup) — see NOTES.md before adding any.
- Goals page = `.gwrap` → `.gside` filter aside + `.gmain`; goal rows = `.grow-*` ledger rows; GoalsOnTrack skin specifics in NOTES.md.
