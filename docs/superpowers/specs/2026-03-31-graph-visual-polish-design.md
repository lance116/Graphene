# Graph Visual Polish & Scalability Design

**Date:** 2026-03-31
**Component:** `src/components/PaperGraph.tsx`
**Goal:** Make the paper graph look 10/10 and scale gracefully to 1000+ papers.

## Design Principles

- **No controls, no panels, no toggles.** The graph should be self-explanatory.
- **Connected Papers aesthetic** — soft, meaningful visual encoding.
- **Obsidian-style semantic zoom** — progressive label reveal on zoom.
- **Dark, cinematic feel** — refined dark mode, not garish.

## Visual Changes

### 1. Node Coloring: Year Gradient (replaces category colors)

Switch from categorical palette to a **sequential gradient based on publication year**, following Connected Papers' proven pattern.

- Parse `paper.published` to extract year
- Map year range across the dataset to a **cool-to-warm gradient**:
  - Oldest papers: `#4a6fa5` (cool steel blue)
  - Mid-range: `#7c5cbf` (soft purple)
  - Recent papers: `#e8845f` (warm coral/amber)
- Interpolate via HSL for smooth transitions
- Papers with no `published` date: neutral gray `#555566`
- This makes temporal clusters immediately visible — old foundational papers vs new work

### 2. Node Styling: Soft Glow

- Add a subtle radial glow around nodes (using `@sigma/node-border` or custom program)
- Node border: thin (1px), slightly lighter than fill color (15% lighter)
- Selected node: white fill with soft white glow
- Hovered node: brighten fill by 20%, increase glow radius

### 3. Node Sizing: Connection-Based (keep current)

- Keep current formula: `5 + (degree / maxDegree) * 12`
- This naturally creates visual hierarchy — hub papers pop out

### 4. Edge Styling: Whisper-Light

- Default edge color: `rgba(255, 255, 255, 0.04)` — barely visible, just hinting at structure
- Active edges (connected to hovered/selected): source node color at 60% opacity, width 1.5
- No arrows — removes visual clutter at scale
- Use straight edges instead of curved when > 200 papers (performance + cleaner at density)

### 5. Label Rendering: Semantic Zoom

- **Zoomed out (< 3px threshold):** No labels — just the constellation of nodes
- **Mid zoom (3-8px):** Only top-degree nodes (top 15%) show labels
- **Zoomed in (> 8px):** Full label rendering with current density settings
- Font: keep JetBrains Mono at 11px
- Label color: `#c8c8d4` (slightly dimmed from current `#e4e4ed`)
- Truncation: 40 chars max (shorter than current 50 for cleaner look)

### 6. Background

- Keep current gradient but darken slightly:
  - `radial-gradient(circle at 50% 50%, rgba(80, 100, 200, 0.025) 0%, transparent 70%)`
  - `linear-gradient(to bottom, #08080e, #04040a)`
- Subtle vignette effect via the radial gradient

### 7. Hover Interaction: Tooltip Card

Add a floating tooltip on node hover with paper metadata:

```
┌──────────────────────────────┐
│ Paper Title (full, wrapped)  │
│ Author1, Author2, +3 more   │
│ 2024 · cs.AI                │
└──────────────────────────────┘
```

- Dark card: `#1a1a2e` background, `#e4e4ed` text
- Border: `1px solid rgba(255,255,255,0.08)`
- Border radius: 8px
- Positioned near cursor, offset to avoid covering the node
- Appears after 150ms delay (prevents flicker on fast mouse moves)
- Max width: 280px

### 8. Neighborhood Dimming (refine current)

- Non-neighbor nodes: `rgba(30, 30, 50, 0.3)` (more subtle than current `#1a1a2a`)
- Non-neighbor edges: fully hidden (keep current behavior)
- Transition feels smooth because only opacity/color changes

## Scalability (1000+ papers)

### 9. Adaptive Edge Filtering

- Current: show edges with strength >= 0.5
- New: dynamically adjust threshold based on paper count:
  - < 50 papers: threshold 0.4
  - 50-200 papers: threshold 0.5
  - 200-500 papers: threshold 0.6
  - 500+ papers: threshold 0.7
- This keeps edge count manageable regardless of library size

### 10. Adaptive Node Sizing

- Scale down base node size as paper count grows:
  - < 50: base 5, max addition 12 (current)
  - 50-200: base 4, max addition 10
  - 200-500: base 3, max addition 8
  - 500+: base 2, max addition 6
- Prevents visual clutter while maintaining size hierarchy

### 11. ForceAtlas2 Tuning for Scale

- Increase gravity multiplier for large graphs (3x at 500+ papers vs current 2x)
- Increase iterations cap to 500 for large graphs (needs more settling time)
- barnesHutOptimize already enabled (good)

### 12. Noverlap Spacing

- Scale down minimum spacing as graph grows:
  - < 100: spacing 50 (current)
  - 100-500: spacing 30
  - 500+: spacing 15

## Empty State (keep current)

Current empty state is fine — dark bg with `</>` icon and message.

## What NOT to change

- Keep Sigma.js + Graphology + ForceAtlas2 stack (it's solid)
- Keep click-to-select behavior and `onSelectPaper` callback
- Keep WebGL rendering (essential for scale)
- Keep camera animated reset on load
- Keep `hideEdgesOnMove: false` and `hideLabelsOnMove: false`

## Implementation Notes

- The tooltip is a DOM overlay (HTML div), not rendered in WebGL — positioned via Sigma's `nodeToViewport` coordinate mapping
- Year gradient computation happens once during `buildGraph`, not per-frame
- The adaptive thresholds are pure math on `papers.length`, no user input needed
- All changes are in `PaperGraph.tsx` — no new files needed
