# News

Multi-source intelligence briefings with source analysis, consensus/divergence, and entity tracking.

## Article structure

| Field | Type | Notes |
|-------|------|-------|
| title | text | Max 60 chars, factual (no clickbait) |
| content | markdown | Full article body |
| excerpt | text | 1-2 sentence factual summary |
| category | text | infrastructure, models, engineering, economics, policy, security |
| sources[] | array | Required, min 1. Each: name, region, url, perspective |
| consensus[] | text[] | Points where all sources agree |
| divergence[] | text[] | Where sources conflict or frame differently |
| takeaway | text | Astar-specific actionable insight |
| entities[] | array | Companies/orgs: {name, domain} — used for logo display via Clearbit |
| continues | slug | Links to previous article (for story continuations) |
| published | boolean | Controls visibility |

## Source structure

```json
{
  "name": "Reuters",
  "region": "US",        // US, EU, NO, UK, Intl
  "url": "https://...",
  "perspective": "How this source frames the story"
}
```

## Quality validation (server-side)

- Title max 60 chars
- At least 1 source with name + url + perspective
- Consensus required (2+ sources must agree on something)
- Entities required (at least one company/org identified)

## Pipeline flow

1. Agent ingests sources (multiple news outlets)
2. Calls `create_news` MCP tool with structured article
3. Server validates quality rules
4. Article published to Sanity CMS
5. Dashboard auto-scrolls new articles into the news feed
6. Entity logos fetched from Clearbit API (`logo.clearbit.com/{domain}`)

## Continuations

Articles can link to previous coverage via the `continues` field (slug reference). The dashboard shows a continuation badge and the detail modal links to the prior article.

## Storage

Articles stored in Sanity as `newsPost` document type, not in Supabase. Only audit events for news actions go to Supabase.

## Key files

- `supabase/functions/mcp-server/index.ts` — `create_news`, `update_news`, `delete_news`, `list_news` tools
- `cli/src/commands/news.ts` — `astar news list`, `astar news info`
- `src/components/PublicDashboard.tsx` — news auto-scroll + detail modal
