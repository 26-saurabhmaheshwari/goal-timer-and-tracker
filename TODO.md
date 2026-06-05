# TODO

## Auto current month / year (do later)
The dashboard is hardcoded to 2026 and to the seeded MONTHS data. Make it derive from the real date:
- New months auto-add (e.g. July shows up in July) — currently tabs map over `MONTHS` = `SEED_MONTHS` (Jan–May 2026 only).
- Year rollover into 2027+ — currently hardcoded:
  - `<title>` (line ~6)
  - year button `data-o="year"` (line ~621)
  - "2026 so far" battery label (line ~523)
  - `ymList()` spans only Jun 2026–May 2027 (line ~757)
- Note: past-vs-current battery coloring IS already real-time (line ~609); only the hour values + month list + year labels are static.
