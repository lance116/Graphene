"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Paper, PaperConnection } from "@/lib/supabase";
import { decodeEntities } from "@/lib/entities";
import type GraphType from "graphology";
import type SigmaType from "sigma";

// Desaturated palette for dark backgrounds
const PALETTE = [
  "#5E9FD6", "#E57373", "#81C784", "#FFB74D",
  "#a855f7", "#06b6d4", "#f472b6", "#a3e635",
  "#fb923c", "#2dd4bf", "#c084fc", "#fbbf24",
];

const CATEGORY_COLORS: Record<string, string> = {};
let colorIdx = 0;
function getCategoryColor(cat: string): string {
  if (!CATEGORY_COLORS[cat]) {
    CATEGORY_COLORS[cat] = PALETTE[colorIdx % PALETTE.length];
    colorIdx++;
  }
  return CATEGORY_COLORS[cat];
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

    // Count degrees
    const degreeMap = new Map<string, number>();
    const validEdges = connections.filter(
      c => nodeIds.has(c.paper_a) && nodeIds.has(c.paper_b) && (c.strength || 0) >= 0.5
    );
    for (const c of validEdges) {
      degreeMap.set(c.paper_a, (degreeMap.get(c.paper_a) || 0) + 1);
      degreeMap.set(c.paper_b, (degreeMap.get(c.paper_b) || 0) + 1);
    }
    const maxDegree = Math.max(1, ...degreeMap.values());

    for (const p of papers) {
      const cats = (p.categories as string[]) || [];
      const cat = cats[0] || "Other";
      const degree = degreeMap.get(p.id) || 0;
      const size = 5 + (degree / maxDegree) * 12;

      const catKeys = Object.keys(CATEGORY_COLORS);
      const catAngle = catKeys.indexOf(cat);
      const angle = catAngle >= 0
        ? (catAngle / Math.max(catKeys.length, 1)) * Math.PI * 2
        : Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 60;

      const fullTitle = decodeEntities(p.title);
      const label = fullTitle.length > 50 ? fullTitle.slice(0, 47) + "..." : fullTitle;

      graph.addNode(p.id, {
        label,
        x: Math.cos(angle) * dist + (Math.random() - 0.5) * 40,
        y: Math.sin(angle) * dist + (Math.random() - 0.5) * 40,
        size,
        color: getCategoryColor(cat),
        degree,
      });
    }

    for (const c of validEdges) {
      const key = `${c.paper_a}-${c.paper_b}`;
      if (!graph.hasEdge(key)) {
        graph.addEdgeWithKey(key, c.paper_a, c.paper_b, {
          color: "#2a2a3a",
          size: 0.5,
          type: "curved",
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
      const { EdgeCurvedArrowProgram } = await import("@sigma/edge-curve");
      if (cancelled) return;

      // Use inferred settings as base, then override
      const inferred = forceAtlas2.inferSettings(graph);
      const iterations = Math.min(300, Math.max(100, papers.length * 5));
      forceAtlas2.assign(graph, {
        iterations,
        settings: {
          ...inferred,
          gravity: (inferred.gravity || 1) * 2,
          barnesHutOptimize: true,
          slowDown: 8,
        },
      });

      noverlap.assign(graph, 50);

      const sigma = new Sigma(graph, container, {
        renderEdgeLabels: false,
        labelFont: "'JetBrains Mono', monospace",
        labelSize: 11,
        labelWeight: "500",
        labelColor: { color: "#e4e4ed" },
        labelRenderedSizeThreshold: 5,
        labelDensity: 0.07,
        labelGridCellSize: 80,
        defaultEdgeColor: "#2a2a3a",
        defaultEdgeType: "curved",
        defaultNodeColor: "#6b7280",
        stagePadding: 60,
        zIndex: true,
        hideEdgesOnMove: false,
        hideLabelsOnMove: false,
        edgeProgramClasses: {
          curved: EdgeCurvedArrowProgram,
        },
        nodeReducer: (node, data) => {
          const res = { ...data };
          const activeNode = hoveredNodeRef.current || selectedRef.current;

          if (activeNode && activeNode !== node) {
            const isNeighbor = graph.neighbors(activeNode).includes(node);
            if (!isNeighbor) {
              res.color = "#1a1a2a";
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
            // Keep original color so the highlight background has contrast with label text
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
              res.size = 2;
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
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#0a0a10" }}>
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
          background: "radial-gradient(circle at 50% 50%, rgba(99,130,255,0.03) 0%, transparent 70%), linear-gradient(to bottom, #0a0a10, #06060a)",
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
