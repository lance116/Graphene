# Graphene

Research paper management platform with AI-powered enrichment, knowledge graph visualization, and chat.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Supabase** (Postgres, auth, storage, pgvector)
- **Anthropic SDK** (Claude Opus 4.6 for enrichment, Sonnet 4.6 for chat)
- **Tailwind CSS v4**, Framer Motion, Lucide icons
- **Custom canvas graph** in `PaperGraph.tsx` (Barnes-Hut force simulation)

## Commands

```bash
npm run dev      # Dev server (Turbopack)
npm run build    # Production build
npm run lint     # ESLint
```

No test framework configured yet.

## Project Structure

```
src/
  app/
    api/          # ~22 API routes (papers, chat, profiles, search, feed, tokens, auth)
    explore/      # Discovery page
    paper/[id]/   # Paper detail
    profile/[username]/
    page.tsx      # Main dashboard (graph + list + detail panels)
  components/
    PaperGraph.tsx    # 2D force graph (canvas, Barnes-Hut physics)
    PaperDetail.tsx   # Paper info panel with chat
    AddPaperModal.tsx # URL ingestion (arXiv + web)
    PaperReader.tsx   # PDF viewer
    AuthProvider.tsx  # Google OAuth context
  lib/
    supabase.ts   # DB client + types (Paper, Profile, PaperConnection, etc.)
    ai.ts         # Claude API calls (summarize, rate, chat, metadata)
    arxiv.ts      # arXiv scraping
    tokens.ts     # Daily 100K token budget tracking
    ratelimit.ts  # Per-user rate limiting
```

## Architecture

- **Auth:** Google OAuth via Supabase. JWT validated server-side via `getUser()` in `lib/auth.ts`.
- **Paper ingestion:** User pastes URL -> scrape arXiv or web -> create shared `papers` row + user `user_papers` entry.
- **Enrichment:** `/api/papers/[id]/enrich` sends full text to Claude for summary + scoring (honesty, rigor, novelty, etc.). 60s timeout.
- **Graph:** `PaperGraph.tsx` renders a custom canvas force-directed graph. Nodes = papers, edges = `paper_connections`. Uses quadtree Barnes-Hut for O(n log n) repulsion. Render loop uses `requestAnimationFrame` with idle-skip optimization.
- **Chat:** `/api/chat` streams Claude responses with paper context injected as system prompt.
- **Panels:** Main page has resizable 3-panel layout (list | graph | detail).

## Database

Core tables: `papers`, `user_papers`, `paper_connections`, `chat_messages`, `profiles`, `paper_stars`, `token_usage`, `banned_users`. Migrations in `supabase-*.sql` files at repo root.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
```

## Style Guide

- Dark theme, pure black background, JetBrains Mono font throughout
- Monospace terminal aesthetic with subtle borders (#222) and white accent
- Keep UI minimal - no unnecessary chrome or decoration
- Canvas rendering for the graph (not DOM nodes) for performance
- Pre-compute expensive values outside render loops (no allocations per frame)
- Colors use the 8-entry COLORS palette in PaperGraph.tsx with pre-computed variants

## Code Conventions

- Path alias: `@/*` -> `./src/*`
- API routes return `NextResponse.json()` with appropriate status codes
- AI calls go through `lib/ai.ts` - don't call Anthropic SDK directly from routes
- Rate limiting and token tracking on all AI endpoints
- Supabase client created per-request in API routes (not shared)
- Prefer refs over state for high-frequency canvas updates (avoids re-renders)
- No tests yet - verify changes with `npm run build`
