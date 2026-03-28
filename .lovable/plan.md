

# Redesign Skills UI: Table List + Detail Modal

## Current State
Skills display as a 2-column card grid with inline expand/collapse. The user wants it to look like the reference screenshots: a numbered table list (image 1) that opens a detail modal on click (image 2).

## Target Layout

### Skills Table (replaces card grid)
```text
SKILLS & KNOWLEDGE
_______________________________________________
Q  Search skills...                          /
_______________________________________________

#    SKILL                           UPDATED
_______________________________________________
1    skill-name                     Mar 28
     description text here...
_______________________________________________
2    another-skill                  Mar 25
     short description...
_______________________________________________
```
- Full-width rows, numbered, monospace skill name bold
- Description as muted subtitle underneath
- Tags shown inline after description
- Right-aligned date column
- Minimal borders (bottom border per row, accent underline on header)

### Skill Detail Modal (on row click)
```text
+--------------------------------------------------+
|  skills / skill-name                         [X]  |
|                                                   |
|  skill-name                                       |
|                                                   |
|  +-------------------------------------------+    |
|  | SUMMARY                                   |    |
|  | Description text here as summary box      |    |
|  | - bullet point 1                          |    |
|  | - bullet point 2                          |    |
|  +-------------------------------------------+    |
|                                                   |
|  TAGS: tag1  tag2  tag3           UPDATED         |
|                                          Mar 28   |
|  ─────────────────────────────────                |
|  📄 SKILL.md                                      |
|  ─────────────────────────────────                |
|                                                   |
|  ## Rendered markdown content                     |
|  Full skill.md rendered here...                   |
|                                                   |
|  ─────────────────────────────────                |
|  REFERENCE FILES                                  |
|  📄 filename.md  (expandable)                     |
|  📄 template.md  (expandable)                     |
+--------------------------------------------------+
```
- Uses Dialog component (already available)
- Breadcrumb path at top
- Summary box with description
- Sidebar-style metadata (tags, updated date) or below summary
- Markdown content rendered with `react-markdown`
- Reference files as expandable sections

## Files Changed

**`src/components/PublicDashboard.tsx`** — Replace the skills card grid (lines 80-185) with:
1. A `<Table>` layout with `#`, `SKILL`, `UPDATED` columns
2. Each row clickable, opens `selectedSkill` state
3. A `<Dialog>` that renders the full skill detail view styled like image 2

No new files needed. Uses existing `Table`, `Dialog`, `Input` components.

