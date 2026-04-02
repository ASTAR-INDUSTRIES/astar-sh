

## Dashboard Layout Redesign

### New layout

```text
┌────────┬──────────┬──────────┬──────────┬─────────┬──────────────┐
│ 12:34  │ Skills   │ DL       │ Active   │ Hours   │   ASTAR ✦    │
│ Thu 02 │   47     │  1,247   │   12     │ 187/wk  │   v0.0.7     │
├────────┴──────────┴──────────┴──────────┴─────────┴──────────────┤
│  ▓▓▓░░▓▓▓▓░░░▓▓▓░▓▓▓▓▓░░░░▓▓░░░░▓▓▓▓▓░▓▓░░▓▓▓░░▓▓▓▓░░░▓▓▓░   │
│               Hours Heatmap (compact, 26 weeks)                  │
├───────────────────────────────┬───────────────────────────────────┤
│                               │                                   │
│       Skills Table            │       Thinking Feed               │
│                               │       (with reactions)            │
│                               │                                   │
├───────────────────────────────┼───────────────────────────────────┤
│                               │                                   │
│       Shipped Calendar        │       News Feed                   │
│       (month view)            │       (clickable, auto-scroll)    │
│                               │                                   │
└───────────────────────────────┴───────────────────────────────────┘
```

### Changes to `src/components/PublicDashboard.tsx`

**1. Remove Research section** — delete the `articles` query, the Research JSX block (lines 435–468), and the `FlaskConical` import.

**2. Restructure top bar** into a single row with 6 cells separated by `gap-px`:
- **Cell 1 — Clock**: shows time (HH:mm:ss.cc), date (Thu Apr 02), and "every second counts" shimmer underneath. Compact vertical stack.
- **Cells 2–5 — Stats**: Skills count, Downloads count, Active Today count, and a new "Hours" stat (placeholder value or pulled from `financial_inquiries` if available — can default to `—` for now).
- **Cell 6 — Brand**: "ASTAR ✦" with version number underneath, right-aligned.

**3. Add Hours Heatmap row** — a new thin horizontal strip below the top bar, spanning full width. This is a compact GitHub-style contribution heatmap showing 26 weeks of CLI activity. Each cell is a small square colored by event density for that day (from `audit_events` timestamps). Use shades of accent color. Label: "Hours Heatmap" centered underneath in tiny mono text.

**4. Replace 3-column main grid with 2-column, 2-row grid**:
- Top-left: Skills table (existing, with scroll)
- Top-right: Thinking feed (existing tweets + reactions, with scroll)
- Bottom-left: Shipped Calendar (existing component)
- Bottom-right: News feed (existing posts list, with scroll, clickable for detail dialog)
- Grid: `grid-cols-2 grid-rows-2`, each quadrant gets `flex-1` with `overflow-hidden`

**5. Move CLI Activity** — remove as a standalone section. The heatmap replaces the raw event list for the public view. (CLI activity data is still fetched for the heatmap and download counts.)

### Technical details

- Heatmap component: inline in PublicDashboard, iterates over last 182 days (26 weeks), counts `audit_events` per day, renders as a grid of small `div`s (4px squares) with opacity/color based on count thresholds.
- Stats "Hours" cell: show `—` as placeholder (no hours tracking data yet).
- Brand cell: static text, accent color diamond.
- Keep all existing data fetches except `articles`.
- Keep the news detail `Dialog` as-is.
- Remove `FlaskConical` from imports.

### Files changed
1. `src/components/PublicDashboard.tsx` — full layout restructure as described above

