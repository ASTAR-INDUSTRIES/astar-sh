

# Skills System via Sanity CMS

## Why Sanity (not Supabase)

You're right — Sanity is the better fit here. It already manages news and research, has **native revision history** (built-in audit trail for every document change), supports rich content (Portable Text for markdown-like editing), and the MCP server already queries Sanity. Keeping skills in Sanity means one content platform for all structured knowledge.

The existing `skill` schema (title, description, icon, order) is used for the login page cards. We'll create a new `knowledgeSkill` type for the rich skill packages, keeping the simple cards separate.

## Architecture

```text
Sanity CMS
├── skill (existing) ─── Login page decorative cards
└── knowledgeSkill (new) ─── Rich skill packages
    ├── title, slug, description, tags
    ├── content (Portable Text / markdown body)
    └── references[] (array of { filename, folder, content })

Audit trail → Sanity's native revision history (free, automatic)
```

## Implementation Steps

### 1. Deploy new Sanity schema: `knowledgeSkill`

Deploy a new document type with:
- `title` (string, required)
- `slug` (slug, sourced from title)
- `description` (text)
- `tags` (array of strings)
- `content` (array of blocks — Portable Text for the main skill.md)
- `references` (array of objects: `{ filename, folder, content }` for supporting files)
- `published` (boolean, default false)
- `author` (string)

### 2. Update MCP server with skill CRUD tools

Add these tools to `supabase/functions/mcp-server/index.ts`:

- **`create_skill`** — Creates a knowledgeSkill document in Sanity via the HTTP API (mutate endpoint). Accepts title, slug, description, tags, content (markdown string converted to blocks or stored as plain text in a dedicated field), references array.
- **`update_skill`** — Patches an existing skill by ID or slug.
- **`delete_skill`** — Deletes a skill document.
- **`list_skills`** — GROQ query with optional text search across title/description/tags.
- **`get_skill`** — Fetch a single skill by slug or ID with all references.
- **`upload_skill_file`** — Adds a reference file (filename, folder, markdown content) to a skill's references array.
- **`delete_skill_file`** — Removes a reference file from the array by filename.
- **`get_skill_history`** — Fetches Sanity revision history for a skill document (native audit).

### 3. Frontend — Public skills browser

Update `PublicDashboard.tsx`:
- Add a "Skills" section with a search input
- Query `*[_type == "knowledgeSkill" && published == true]` from Sanity
- Display as a searchable grid of cards (title, description, tags)
- Click to expand: render the full content with `react-markdown` + `remark-gfm`, show attached reference files

### 4. Frontend — Staff skills management

Update `StaffWorkspace.tsx`:
- Add a "Skills" tab alongside "Thinking"
- List all skills (published and draft) with edit/delete actions
- Inline skill creator: title, slug, description, tags, markdown content textarea
- Link to Sanity Studio for advanced editing
- Show recent revision history (fetched from Sanity API)

### 5. Install dependencies

- `react-markdown` and `remark-gfm` for rendering skill markdown content on the frontend

## Technical Details

- Sanity's Mutate API (`/data/mutate`) is used from the MCP edge function for CRUD — same pattern as the existing `query_content` tool but with `createOrReplace`, `patch`, and `delete` mutations
- Sanity revision history is available via `https://<projectId>.api.sanity.io/v1/data/history/<dataset>/documents/<docId>`
- The `knowledgeSkill` uses a `markdownContent` text field (plain markdown string) alongside optional Portable Text, keeping MCP interactions simple while allowing rich editing in Sanity Studio
- Search uses GROQ: `*[_type == "knowledgeSkill" && (title match $q || description match $q || $q in tags)]`

