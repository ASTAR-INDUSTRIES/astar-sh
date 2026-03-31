

## Emoji Reactions on Tweets (Thinking)

### What we're building
Public visitors can react to any tweet/thought with emoji reactions (like 🔥 👏 🧠 💡 🎯). No login required — reactions are anonymous and stored in the database. Each tweet shows reaction counts inline.

### Database

**New table: `tweet_reactions`**
- `id` (uuid, PK)
- `tweet_id` (uuid, FK → tweets.id ON DELETE CASCADE)
- `emoji` (text, not null) — the emoji character
- `created_at` (timestamptz, default now())

**RLS policies:**
- SELECT: public (everyone can see counts)
- INSERT: public (anonymous reactions allowed)
- No UPDATE/DELETE (reactions are permanent)

**Realtime:** Enable `supabase_realtime` on `tweet_reactions` so counts update live.

### UI Changes — `PublicDashboard.tsx`

Below each tweet, add a row of preset emoji buttons (🔥 👏 🧠 💡 🎯):
- Show current count next to each emoji (only emojis with count > 0 shown, plus a "+" button to pick)
- Clicking an emoji inserts a row into `tweet_reactions` — no auth needed
- Use a realtime subscription to keep counts live
- Subtle animation on click (scale bounce)
- Style: small pill-shaped buttons matching the dark terminal aesthetic

### Files touched
1. **Migration** — create `tweet_reactions` table + RLS + realtime
2. **`src/components/PublicDashboard.tsx`** — add reaction row beneath each tweet, fetch counts, subscribe to realtime, handle clicks

