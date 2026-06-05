# TODO

## Auto current month / year
DONE (2026-06):
- Current calendar month auto-adds as the latest tab (`withCurrentMonth` in `loadMonths`), sourced live from Log entries via `monthCats()`. Gets the 3-period donut view; past months stay single-donut.
- Year label (KPI "so far" + year tab button) now derive from `CUR_YM`.

Still hardcoded (low priority, only matters in 2027+):
- `<title>` (line ~6) says 2026.
- `ymList()` is a fixed Jun 2026 → May 2027 window for the Log month dropdown (line ~810). Make it roll with the real date when the year turns.
