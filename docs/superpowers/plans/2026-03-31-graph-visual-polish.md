# Graph Visual Polish & Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PaperGraph look 10/10 and scale gracefully to 1000+ papers — year-gradient coloring, soft glow nodes, semantic zoom labels, hover tooltip, adaptive density.

**Architecture:** All changes live in `src/components/PaperGraph.tsx`. The component already uses Sigma.js + Graphology + ForceAtlas2. We replace the category color system with a year-based gradient, add a `@sigma/node-border` glow program, implement semantic zoom via Sigma's `labelRenderedSizeThreshold`, add a DOM tooltip overlay, and scale layout parameters based on `papers.length`.

**Tech Stack:** Sigma.js v3.0.2, Graphology v0.26.0, @sigma/node-border v3.0.0, ForceAtlas2, TypeScript, React

---

## File Structure

- **Modify:** `src/components/PaperGraph.tsx` — all graph rendering logic (single file, ~263 lines currently)

No new files needed.

---

### Task 1: Replace Category Colors with Year Gradient

**Files:**
- Modify: `src/components/PaperGraph.tsx:1-100`

- [ ] **Step 1: Remove the old category color system**

Delete lines 9-24 (the `PALETTE`, `CATEGORY_COLORS`, `colorIdx`, and `getCategoryColor` function). Replace with the year-gradient system:

```typescript
// Year-based color gradient: cool blue (old) → soft purple (mid) → warm coral (new)
const YEAR_GRADIENT = [
  { pos: 0, h: 216, s: 40, l: 50 },   // #4a6fa5 steel blue
  { pos: 0.5, h: 262, s: 40, l: 52 },  // #7c5cbf soft purple
  { pos: 1, h: 16, s: 72, l: 60 },     // #e8845f warm coral
];
const NO_YEAR_COLOR = "#555566";

function interpolateYearColor(t: number): string {
  // t is 0..1 where 0 = oldest, 1 = newest
  const clamped = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < YEAR_GRADIENT.length - 1 && YEAR_GRADIENT[i + 1].pos <= clamped) i++;
  if (i >= YEAR_GRADIENT.length - 1) {
    const c = YEAR_GRADIENT[YEAR_GRADIENT.length - 1];
    return `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
  }
  const a = YEAR_GRADIENT[i];
  const b = YEAR_GRADIENT[i + 1];
  const local = (clamped - a.pos) / (b.pos - a.pos);
  const h = a.h + (b.h - a.h) * local;
  const s = a.s + (b.s - a.s) * local;
  const l = a.l + (b.l - a.l) * local;
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function getYearFromPaper(paper: Paper): number | null {
  if (!paper.published) return null;
  const d = new Date(paper.published);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}
```

- [ ] **Step 2: Update `buildGraph` to use year-based colors**

Inside `buildGraph`, before the node loop, compute the year range:

```typescript
// Compute year range for gradient
const years = papers.map(getYearFromPaper).filter((y): y is number => y !== null);
const minYear = years.length > 0 ? Math.min(...years) : 2020;
const maxYear = years.length > 0 ? Math.max(...years) : 2025;
const yearSpan = Math.max(1, maxYear - minYear);
```

Then in the node-adding loop, replace `color: getCategoryColor(cat)` with:

```typescript
const year = getYearFromPaper(p);
const color = year !== null
  ? interpolateYearColor((year - minYear) / yearSpan)
  : NO_YEAR_COLOR;
```

Also remove the `catKeys`/`catAngle` angle calculation that used `CATEGORY_COLORS`. Replace with a simpler random initial position (ForceAtlas2 will override anyway):

```typescript
const angle = Math.random() * Math.PI * 2;
const dist = 80 + Math.random() * 60;
```

The full node-adding block becomes:

```typescript
for (const p of papers) {
  const degree = degreeMap.get(p.id) || 0;
  const size = 5 + (degree / maxDegree) * 12;
  const angle = Math.random() * Math.PI * 2;
  const dist = 80 + Math.random() * 60;

  const fullTitle = decodeEntities(p.title);
  const label = fullTitle.length > 40 ? fullTitle.slice(0, 37) + "..." : fullTitle;

  const year = getYearFromPaper(p);
  const color = year !== null
    ? interpolateYearColor((year - minYear) / yearSpan)
    : NO_YEAR_COLOR;

  graph.addNode(p.id, {
    label,
    x: Math.cos(angle) * dist + (Math.random() - 0.5) * 40,
    y: Math.sin(angle) * dist + (Math.random() - 0.5) * 40,
    size,
    color,
    borderColor: color,
    degree,
  });
}
```

Note: label truncation shortened from 50→40 chars.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: Compiles successfully. No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/PaperGraph.tsx
git commit -m "feat(graph): replace category colors with year-based gradient"
```

---

### Task 2: Add Node Glow Effect with @sigma/node-border

**Files:**
- Modify: `src/components/PaperGraph.tsx:113-160` (Sigma initialization section)

- [ ] **Step 1: Import and configure the node border program**

Add the import inside the async IIFE (next to other dynamic imports):

```typescript
const { createNodeBorderProgram } = await import("@sigma/node-border");
```

Create the node program with a glow-like border:

```typescript
const NodeGlowProgram = createNodeBorderProgram({
  borders: [
    {
      size: { value: 0.15, mode: "relative" },
      color: { attribute: "borderColor", defaultValue: "#555566" },
    },
    {
      size: { value: 0.05, mode: "relative" },
      color: { transparent: true },
    },
  ],
});
```

This creates a thin colored border (15% of node radius) with a transparent outer gap (5%) that acts as padding, giving a subtle outlined look.

- [ ] **Step 2: Wire the node program into Sigma settings**

In the `new Sigma(graph, container, { ... })` options, add:

```typescript
defaultNodeType: "bordered",
nodeProgramClasses: {
  bordered: NodeGlowProgram,
},
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add src/components/PaperGraph.tsx
git commit -m "feat(graph): add subtle node border/glow via @sigma/node-border"
```

---

### Task 3: Refine Edge Styling

**Files:**
- Modify: `src/components/PaperGraph.tsx:88-98` (edge creation), `src/components/PaperGraph.tsx:141-205` (Sigma config + reducers)

- [ ] **Step 1: Change default edge appearance to whisper-light**

In the edge-adding loop, change the edge attributes:

```typescript
for (const c of validEdges) {
  const key = `${c.paper_a}-${c.paper_b}`;
  if (!graph.hasEdge(key)) {
    graph.addEdgeWithKey(key, c.paper_a, c.paper_b, {
      color: "rgba(255, 255, 255, 0.04)",
      size: 0.3,
    });
  }
}
```

Changes: removed `type: "curved"`, lighter color, thinner default.

- [ ] **Step 2: Switch to straight edges and remove arrow program**

In the Sigma constructor options:
- Remove `defaultEdgeType: "curved"`
- Remove the `edgeProgramClasses` object entirely (use default straight line program)
- Update `defaultEdgeColor` to match:

```typescript
defaultEdgeColor: "rgba(255, 255, 255, 0.04)",
```

Remove this import (no longer needed):

```typescript
// DELETE: const { EdgeCurvedArrowProgram } = await import("@sigma/edge-curve");
```

- [ ] **Step 3: Update the edge reducer for active edges**

In the `edgeReducer`, update the active edge styling:

```typescript
edgeReducer: (edge, data) => {
  const res = { ...data };
  const activeNode = hoveredNodeRef.current || selectedRef.current;

  if (activeNode) {
    const [source, target] = graph.extremities(edge);
    if (source === activeNode || target === activeNode) {
      const neighborId = source === activeNode ? target : source;
      const neighborColor = graph.getNodeAttribute(neighborId, "color");
      res.color = neighborColor;
      res.size = 1.5;
      res.zIndex = 1;
    } else {
      res.hidden = true;
    }
  }

  return res;
},
```

Change: active edge width from 2 → 1.5.

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add src/components/PaperGraph.tsx
git commit -m "feat(graph): whisper-light edges, remove curves and arrows"
```

---

### Task 4: Semantic Zoom Labels

**Files:**
- Modify: `src/components/PaperGraph.tsx:141-160` (Sigma settings)

- [ ] **Step 1: Update label settings for semantic zoom**

In the Sigma constructor options, update these settings:

```typescript
labelFont: "'JetBrains Mono', monospace",
labelSize: 11,
labelWeight: "500",
labelColor: { color: "#c8c8d4" },
labelRenderedSizeThreshold: 8,
labelDensity: 0.12,
labelGridCellSize: 100,
```

Changes from current:
- `labelColor`: `#e4e4ed` → `#c8c8d4` (slightly dimmer)
- `labelRenderedSizeThreshold`: 5 → 8 (labels only show when nodes are 8px+ on screen, meaning you need to zoom in more to see labels — this is the semantic zoom)
- `labelDensity`: 0.07 → 0.12 (show more labels when zoomed in enough)
- `labelGridCellSize`: 80 → 100 (more spacing between labels)

This means when zoomed out, only the largest hub nodes show labels. As you zoom in, progressively more labels appear.

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add src/components/PaperGraph.tsx
git commit -m "feat(graph): semantic zoom labels — progressive reveal on zoom"
```

---

### Task 5: Hover Tooltip Card

**Files:**
- Modify: `src/components/PaperGraph.tsx:26-36` (component state), `src/components/PaperGraph.tsx:207-225` (event handlers), `src/components/PaperGraph.tsx:253-261` (JSX render)

- [ ] **Step 1: Add tooltip state**

Add state for the tooltip inside the component, after the refs:

```typescript
const [tooltip, setTooltip] = useState<{
  x: number;
  y: number;
  paper: Paper;
} | null>(null);
const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Create a paper lookup map (add after `selectedRef.current = selectedPaperId`):

```typescript
const paperMap = useMemo(() => {
  const map = new Map<string, Paper>();
  for (const p of papers) map.set(p.id, p);
  return map;
}, [papersKey]);
```

- [ ] **Step 2: Update enterNode/leaveNode handlers to show tooltip**

Replace the `enterNode` and `leaveNode` handlers:

```typescript
sigma.on("enterNode", ({ node, event }) => {
  hoveredNodeRef.current = node;
  sigma.refresh();

  // Show tooltip after 150ms delay
  if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
  tooltipTimeoutRef.current = setTimeout(() => {
    const paper = paperMap.get(node);
    if (!paper) return;
    const nodeDisplayData = sigma.getNodeDisplayData(node);
    if (!nodeDisplayData) return;
    const viewportPos = sigma.graphToViewport(nodeDisplayData);
    setTooltip({
      x: viewportPos.x,
      y: viewportPos.y,
      paper,
    });
  }, 150);
});

sigma.on("leaveNode", () => {
  hoveredNodeRef.current = null;
  sigma.refresh();
  if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
  tooltipTimeoutRef.current = null;
  setTooltip(null);
});
```

Also clear tooltip on click (add after the existing `clickNode` handler):

```typescript
sigma.on("clickNode", ({ node }) => {
  onSelectPaper(node);
  setTooltip(null);
});
```

- [ ] **Step 3: Add tooltip cleanup to the useEffect cleanup function**

In the cleanup return at the end of the main useEffect:

```typescript
return () => {
  cancelled = true;
  if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
  setTooltip(null);
  if (sigmaRef.current) {
    sigmaRef.current.kill();
    sigmaRef.current = null;
  }
};
```

- [ ] **Step 4: Render the tooltip card in JSX**

Replace the current return JSX (the container div at the bottom) with:

```tsx
return (
  <div className="relative w-full h-full">
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, rgba(80, 100, 200, 0.025) 0%, transparent 70%), linear-gradient(to bottom, #08080e, #04040a)",
      }}
    />
    {tooltip && (
      <div
        className="absolute pointer-events-none z-50"
        style={{
          left: tooltip.x + 14,
          top: tooltip.y - 10,
          maxWidth: 280,
        }}
      >
        <div
          className="rounded-lg px-3 py-2.5 text-xs"
          style={{
            background: "#1a1a2e",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#e4e4ed",
          }}
        >
          <div className="font-medium text-sm leading-tight mb-1" style={{ color: "#f0f0f6" }}>
            {decodeEntities(tooltip.paper.title)}
          </div>
          <div className="text-neutral-400 leading-snug">
            {(tooltip.paper.authors || []).length > 2
              ? `${tooltip.paper.authors.slice(0, 2).join(", ")} +${tooltip.paper.authors.length - 2} more`
              : (tooltip.paper.authors || []).join(", ")}
          </div>
          {(tooltip.paper.published || (tooltip.paper.categories && tooltip.paper.categories.length > 0)) && (
            <div className="text-neutral-500 mt-1">
              {tooltip.paper.published && new Date(tooltip.paper.published).getFullYear()}
              {tooltip.paper.published && tooltip.paper.categories?.[0] && " · "}
              {tooltip.paper.categories?.[0]}
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);
```

Note: the background gradient is also updated here (darkened per spec).

- [ ] **Step 5: Verify it builds**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 6: Commit**

```bash
git add src/components/PaperGraph.tsx
git commit -m "feat(graph): add hover tooltip card with title, authors, year"
```

---

### Task 6: Adaptive Scaling for Large Libraries

**Files:**
- Modify: `src/components/PaperGraph.tsx:46-100` (buildGraph), `src/components/PaperGraph.tsx:118-140` (ForceAtlas2 config)

- [ ] **Step 1: Add adaptive edge filtering**

In `buildGraph`, replace the fixed strength threshold:

```typescript
const count = papers.length;
const edgeThreshold = count > 500 ? 0.7 : count > 200 ? 0.6 : count > 50 ? 0.5 : 0.4;
const validEdges = connections.filter(
  c => nodeIds.has(c.paper_a) && nodeIds.has(c.paper_b) && (c.strength || 0) >= edgeThreshold
);
```

- [ ] **Step 2: Add adaptive node sizing**

Replace the fixed sizing formula:

```typescript
const baseSize = count > 500 ? 2 : count > 200 ? 3 : count > 50 ? 4 : 5;
const sizeRange = count > 500 ? 6 : count > 200 ? 8 : count > 50 ? 10 : 12;
```

Then in the node loop:

```typescript
const size = baseSize + (degree / maxDegree) * sizeRange;
```

- [ ] **Step 3: Add adaptive ForceAtlas2 settings**

Update the ForceAtlas2 configuration:

```typescript
const gravityMult = count > 500 ? 3 : count > 200 ? 2.5 : 2;
const iterations = Math.min(500, Math.max(100, count * 5));
forceAtlas2.assign(graph, {
  iterations,
  settings: {
    ...inferred,
    gravity: (inferred.gravity || 1) * gravityMult,
    barnesHutOptimize: true,
    slowDown: 8,
  },
});
```

- [ ] **Step 4: Add adaptive noverlap spacing**

Replace the fixed noverlap call:

```typescript
const noverlapSpacing = count > 500 ? 15 : count > 100 ? 30 : 50;
noverlap.assign(graph, noverlapSpacing);
```

- [ ] **Step 5: Verify it builds**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 6: Commit**

```bash
git add src/components/PaperGraph.tsx
git commit -m "feat(graph): adaptive scaling for edge threshold, node size, layout density"
```

---

### Task 7: Refine Node Reducer and Background

**Files:**
- Modify: `src/components/PaperGraph.tsx:160-205` (nodeReducer), `src/components/PaperGraph.tsx:241-250` (empty state)

- [ ] **Step 1: Update the nodeReducer for softer dimming**

Replace the nodeReducer:

```typescript
nodeReducer: (node, data) => {
  const res = { ...data };
  const activeNode = hoveredNodeRef.current || selectedRef.current;

  if (activeNode && activeNode !== node) {
    const isNeighbor = graph.neighbors(activeNode).includes(node);
    if (!isNeighbor) {
      res.color = "rgba(30, 30, 50, 0.3)";
      res.borderColor = "rgba(30, 30, 50, 0.3)";
      res.label = "";
      res.zIndex = 0;
    } else {
      res.zIndex = 1;
    }
  }

  if (node === activeNode) {
    res.highlighted = true;
    res.zIndex = 2;
  }

  if (node === selectedRef.current) {
    res.color = "#ffffff";
    res.borderColor = "#ffffff";
    res.highlighted = true;
  }

  return res;
},
```

Changes: dimmed color softer (`rgba(30, 30, 50, 0.3)` vs `#1a1a2a`), `borderColor` is also dimmed/highlighted to match the node glow.

- [ ] **Step 2: Update empty state background to match**

In the empty state div, update background:

```tsx
<div className="w-full h-full flex items-center justify-center" style={{ background: "#08080e" }}>
```

Changed from `#0a0a10` to `#08080e` to match the new gradient.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add src/components/PaperGraph.tsx
git commit -m "feat(graph): softer dimming, consistent background"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Year gradient (Task 1), node glow (Task 2), edge refinement (Task 3), semantic zoom (Task 4), hover tooltip (Task 5), adaptive scaling (Task 6), dimming + bg (Task 7) — all spec sections covered.
- [x] **Placeholder scan:** No TBDs, TODOs, or vague steps. All code blocks are complete.
- [x] **Type consistency:** `borderColor` attribute used consistently in Tasks 1, 2, and 7. `interpolateYearColor` and `getYearFromPaper` defined in Task 1, used in Task 1. `paperMap` defined in Task 5, used in Task 5. `edgeThreshold` defined and used in Task 6.
