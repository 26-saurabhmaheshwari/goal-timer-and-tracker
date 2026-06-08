# time-dashboard

Single-file personal time/goal/habit dashboard. **The entire app is `index.html`** (~2200 lines, embedded CSS + JS, Chart.js via CDN). It runs from `file://` and deploys as one file to GitHub Pages.

## Hard constraints (violating these breaks things)
- **Never split `index.html`.** The user edits the `file://` copy directly; index.html is the source of truth, not a build artifact. No `src/` + build step.
- **Never use a preview server / headless Chrome** to render it — isolated filesystem, wasted tokens. The user eyeballs on `file://` and reports back.
- **Never touch Firestore Security Rules.** The user pastes those manually.
- **FILE MAP comment at top of file** must contain NO nested `-->` (a nested comment terminator breaks the whole page).
- Edit > Write. Don't re-read the whole file to verify an edit.

## Deploy / push dance (personal repo)
Repo: `goal-timer-and-tracker` on GitHub account `26-saurabhmaheshwari`. Branch: **`master`**.
Push only when the user explicitly says "push" (also "psuh"/"push now"). Sequence:
```
gh auth switch --user 26-saurabhmaheshwari
git push origin master
gh auth switch --user surendrapatel-32co   # always switch back
```

## Verify before reporting
After any JS edit, run `node test.js` (syntax check + invariant guards). It catches the recurring bug classes below. Then tell the user to eyeball on `file://`.

## State model & the recurring bug classes
Persisted state = localStorage keys (`LS_*` consts ~line 766) + in-memory mirrors (`COLORS`, `ICONS`, `ALLCATS`, `TASK_CAT`, `MONTHS`, ...). Firestore overrides localStorage when signed in.

**Merge precedence (the "color/icon doesn't persist" bug).** Startup merge MUST be `{...SEED, ...loadObj(KEY, {})}` — seeds are defaults, user-saved values override. The reverse (`...SEED` last) silently reverts user edits on every load. `test.js` guards this.

**Adding any new persisted state — wire it in ALL of these or it silently drops:**
1. `LS_<NAME>` const (~line 766) + `SEED_<NAME>` if it has defaults.
2. In-memory init with correct merge precedence (~line 770).
3. `loadX` / `saveX` helpers if used.
4. `persistCats()` (or relevant persist fn) → `localStorage.setItem` + `fbSyncPush()`.
5. **`fbBlob()`** (~line 2119) — add the field to the returned object.
6. **`fb-data` listener** (~line 2128) — add a `set(LS_<NAME>, d.<field>)`.
`test.js` asserts every `fbBlob` field is restored by the listener — run it.

**Category data is Settings-driven, never hardcoded.** Icons/colors/names all come from the Categories tab (`ALLCATS`/`COLORS`/`ICONS`), resolved via `iconFor()` / `colorFor()`. Don't reintroduce hardcoded icon/color maps in render code.

## Layout conventions
- Modal: `.modal-ov` overlay + `.card.modal-card`, toggled via `hidden` + body overflow.
- Sidebar-nav pages (Life Tips, Settings) use `.tipswrap` / `.tipside` / `.tipmain`.
- PDF export = `window.print()` with `@media print` hiding `.noprint`/nav/tabs; `hidden` views don't print.
- Goals have `sec`: `'active' | 'backlog' | 'dream'`.
