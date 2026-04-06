"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Paper, PaperConnection } from "@/lib/supabase";
import { decodeEntities } from "@/lib/entities";
import type GraphType from "graphology";
import type SigmaType from "sigma";

// Year-based color gradient: cool blue (old) → soft purple (mid) → warm coral (new)
const YEAR_GRADIENT = [
  { pos: 0, h: 216, s: 40, l: 50 },   // steel blue
  { pos: 0.5, h: 262, s: 40, l: 52 },  // soft purple
  { pos: 1, h: 16, s: 72, l: 60 },     // warm coral
];
const NO_YEAR_COLOR = "#555566";

function interpolateYearColor(t: number): string {
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

export default function PaperGraph({
  papers,
  connections,
  onSelectPaper,
  selectedPaperId,
}: {
  papers: Paper[];
  connections: PaperConnection[];
  onSelectPaper: (id: string) => void;
  selectedPaperId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<SigmaType | null>(null);
  const graphRef = useRef<GraphType | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const selectedRef = useRef(selectedPaperId);
  selectedRef.current = selectedPaperId;

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    paper: Paper;
  } | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const papersKey = useMemo(() => papers.map(p => p.id).sort().join(","), [papers]);

  const paperMap = useMemo(() => {
    const map = new Map<string, Paper>();
    for (const p of papers) map.set(p.id, p);
    return map;
  }, [papersKey]);

  const buildGraph = useCallback(async () => {
    const { default: Graph } = await import("graphology");
    const graph = new Graph();
    const nodeIds = new Set(papers.map(p => p.id));
    const count = papers.length;

    // Adaptive edge filtering based on library size
    const edgeThreshold = count > 500 ? 0.7 : count > 200 ? 0.6 : count > 50 ? 0.5 : 0.4;

    // Count degrees
    const degreeMap = new Map<string, number>();
    const validEdges = connections.filter(
      c => nodeIds.has(c.paper_a) && nodeIds.has(c.paper_b) && (c.strength || 0) >= edgeThreshold
    );
    for (const c of validEdges) {
      degreeMap.set(c.paper_a, (degreeMap.get(c.paper_a) || 0) + 1);
      degreeMap.set(c.paper_b, (degreeMap.get(c.paper_b) || 0) + 1);
    }
    const maxDegree = Math.max(1, ...degreeMap.values());

    // Adaptive node sizing
    const baseSize = count > 500 ? 2 : count > 200 ? 3 : count > 50 ? 4 : 5;
    const sizeRange = count > 500 ? 6 : count > 200 ? 8 : count > 50 ? 10 : 12;

    // Compute year range for gradient
    const years = papers.map(getYearFromPaper).filter((y): y is number => y !== null);
    const minYear = years.length > 0 ? Math.min(...years) : 2020;
    const maxYear = years.length > 0 ? Math.max(...years) : 2025;
    const yearSpan = Math.max(1, maxYear - minYear);

    for (const p of papers) {
      const degree = degreeMap.get(p.id) || 0;
      const size = baseSize + (degree / maxDegree) * sizeRange;
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

    for (const c of validEdges) {
      const key = `${c.paper_a}-${c.paper_b}`;
      if (!graph.hasEdge(key)) {
        graph.addEdgeWithKey(key, c.paper_a, c.paper_b, {
          color: "rgba(255, 255, 255, 0.04)",
          size: 0.3,
        });
      }
    }

    return graph;
  }, [papersKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || papers.length === 0) return;

    let cancelled = false;

    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    (async () => {
      const graph = await buildGraph();
      if (cancelled) return;
      graphRef.current = graph;

      const fa2Module = await import("graphology-layout-forceatlas2");
      const forceAtlas2 = fa2Module.default || fa2Module;
      const noverlapModule = await import("graphology-layout-noverlap");
      const noverlap = noverlapModule.default || noverlapModule;
      const { default: Sigma } = await import("sigma");
      const { createNodeBorderProgram } = await import("@sigma/node-border");
      if (cancelled) return;

      const count = papers.length;

      // Node glow program
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

      // Adaptive ForceAtlas2
      const inferred = forceAtlas2.inferSettings(graph);
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

      // Adaptive noverlap spacing
      const noverlapSpacing = count > 500 ? 15 : count > 100 ? 30 : 50;
      noverlap.assign(graph, noverlapSpacing);

      const sigma = new Sigma(graph, container, {
        renderEdgeLabels: false,
        labelFont: "'JetBrains Mono', monospace",
        labelSize: 11,
        labelWeight: "500",
        labelColor: { color: "#c8c8d4" },
        labelRenderedSizeThreshold: 14,
        labelDensity: 0.12,
        labelGridCellSize: 100,
        defaultEdgeColor: "rgba(255, 255, 255, 0.04)",
        defaultNodeColor: "#555566",
        defaultNodeType: "bordered",
        nodeProgramClasses: {
          bordered: NodeGlowProgram,
        },
        stagePadding: 60,
        zIndex: true,
        hideEdgesOnMove: false,
        hideLabelsOnMove: false,
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
            res.borderColor = "#ffffff";
            res.highlighted = true;
            res.zIndex = 2;
          }

          return res;
        },
        edgeReducer: (edge, data) => {
          const res = { ...data };
          const activeNode = hoveredNodeRef.current || selectedRef.current;

          if (activeNode) {
            const [source, target] = graph.extremities(edge);
            if (source === activeNode || target === activeNode) {
              const neighborId = source === activeNode ? target : source;
              res.color = graph.getNodeAttribute(neighborId, "color");
              res.size = 1.5;
              res.zIndex = 1;
            } else {
              res.hidden = true;
            }
          }

          return res;
        },
      });

      sigma.on("clickNode", ({ node }) => {
        onSelectPaper(node);
        setTooltip(null);
      });

      sigma.on("enterNode", ({ node }) => {
        hoveredNodeRef.current = node;
        sigma.refresh();

        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        tooltipTimeoutRef.current = setTimeout(() => {
          const paper = paperMap.get(node);
          if (!paper) return;
          const nodeDisplayData = sigma.getNodeDisplayData(node);
          if (!nodeDisplayData) return;
          const viewportPos = sigma.graphToViewport(nodeDisplayData);
          setTooltip({ x: viewportPos.x, y: viewportPos.y, paper });
        }, 150);
      });

      sigma.on("leaveNode", () => {
        hoveredNodeRef.current = null;
        sigma.refresh();
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        tooltipTimeoutRef.current = null;
        setTooltip(null);
      });

      sigmaRef.current = sigma;

      requestAnimationFrame(() => {
        sigma.getCamera().animatedReset({ duration: 300 });
      });
    })();

    return () => {
      cancelled = true;
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      setTooltip(null);
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papersKey, buildGraph, onSelectPaper]);

  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [selectedPaperId]);

  if (papers.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#08080e" }}>
        <div className="text-center">
          <div className="text-6xl mb-4 font-mono text-neutral-700">&lt;/&gt;</div>
          <p className="text-sm tracking-widest uppercase text-neutral-600">No papers yet</p>
          <p className="text-xs text-neutral-700 mt-2">Add a paper to begin mapping</p>
        </div>
      </div>
    );
  }

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
                {tooltip.paper.published && tooltip.paper.categories?.[0] && " \u00b7 "}
                {tooltip.paper.categories?.[0]}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
