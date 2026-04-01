"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Paper, PaperConnection } from "@/lib/supabase";
import { decodeEntities } from "@/lib/entities";
import type GraphType from "graphology";
import type SigmaType from "sigma";

const CATEGORY_COLORS: Record<string, string> = {};
const PALETTE = [
  "#6382ff", "#ff8263", "#63ffaa", "#ffdc63",
  "#be63ff", "#63d2ff", "#ff63b4", "#b4ff63",
  "#ff9563", "#63fff0", "#d463ff", "#fffa63",
];
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

  // Build graph data
  const papersKey = useMemo(() => papers.map(p => p.id).sort().join(","), [papers]);

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

    // Add nodes
    for (const p of papers) {
      const cats = (p.categories as string[]) || [];
      const cat = cats[0] || "Other";
      const degree = degreeMap.get(p.id) || 0;
      const size = 4 + (degree / maxDegree) * 10;

      // Initial position: spread by category
      const catAngle = Object.keys(CATEGORY_COLORS).indexOf(cat);
      const angle = catAngle >= 0
        ? (catAngle / Math.max(Object.keys(CATEGORY_COLORS).length, 1)) * Math.PI * 2
        : Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 50;

      const fullTitle = decodeEntities(p.title);
      const label = fullTitle.length > 40 ? fullTitle.slice(0, 37) + "..." : fullTitle;
      graph.addNode(p.id, {
        label,
        x: Math.cos(angle) * dist + (Math.random() - 0.5) * 30,
        y: Math.sin(angle) * dist + (Math.random() - 0.5) * 30,
        size,
        color: getCategoryColor(cat),
        category: cat,
        degree,
      });
    }

    // Add edges
    for (const c of validEdges) {
      const key = `${c.paper_a}-${c.paper_b}`;
      if (!graph.hasEdge(key)) {
        graph.addEdgeWithKey(key, c.paper_a, c.paper_b, {
          color: "rgba(255,255,255,0.04)",
          size: 0.3,
        });
      }
    }

    return graph;
  }, [papersKey]);

  // Initialize Sigma
  useEffect(() => {
    const container = containerRef.current;
    if (!container || papers.length === 0) return;

    let cancelled = false;

    // Clean up previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    (async () => {
    const graph = await buildGraph();
    if (cancelled) return;
    graphRef.current = graph;

    const { default: forceAtlas2 } = await import("graphology-layout-forceatlas2");
    const { default: noverlap } = await import("graphology-layout-noverlap");
    const { default: Sigma } = await import("sigma");
    if (cancelled) return;

    // Run ForceAtlas2 layout
    const iterations = Math.min(300, Math.max(80, papers.length * 5));
    forceAtlas2.assign(graph, {
      iterations,
      settings: {
        gravity: 5,
        scalingRatio: 20,
        barnesHutOptimize: true,
        barnesHutTheta: 0.5,
        strongGravityMode: true,
        slowDown: 10,
        outboundAttractionDistribution: true,
      },
    });

    // Prevent overlapping nodes
    noverlap.assign(graph, 50);

    // Create Sigma renderer
    const sigma = new Sigma(graph, container, {
      renderEdgeLabels: false,
      labelFont: "JetBrains Mono, monospace",
      labelSize: 10,
      labelColor: { color: "#aaaaaa" },
      labelRenderedSizeThreshold: 3,
      defaultEdgeColor: "rgba(255,255,255,0.04)",
      defaultNodeColor: "#666666",
      stagePadding: 60,
      hideEdgesOnMove: false,
      hideLabelsOnMove: false,
      labelGridCellSize: 100,
      nodeReducer: (node, data) => {
        const res = { ...data };
        const hovered = hoveredNodeRef.current;
        const selected = selectedRef.current;
        const activeNode = hovered || selected;

        if (activeNode) {
          if (node === activeNode) {
            res.highlighted = true;
            res.zIndex = 2;
          } else if (graph.neighbors(activeNode).includes(node)) {
            // Neighbor: keep visible
            res.zIndex = 1;
          } else {
            // Dim non-connected nodes
            res.color = "#333333";
            res.label = "";
            res.zIndex = 0;
          }
        }

        if (node === selected) {
          res.color = "#ffffff";
          res.highlighted = true;
        }

        return res;
      },
      edgeReducer: (edge, data) => {
        const res = { ...data };
        const hovered = hoveredNodeRef.current;
        const selected = selectedRef.current;
        const activeNode = hovered || selected;

        if (activeNode) {
          const [source, target] = graph.extremities(edge);
          if (source === activeNode || target === activeNode) {
            // Highlight connected edge
            const neighborId = source === activeNode ? target : source;
            const neighborColor = graph.getNodeAttribute(neighborId, "color");
            res.color = neighborColor + "88";
            res.size = 1.5;
            res.zIndex = 1;
          } else {
            res.color = "rgba(255,255,255,0.01)";
            res.zIndex = 0;
          }
        }

        return res;
      },
    });

    // Click: select paper
    sigma.on("clickNode", ({ node }) => {
      onSelectPaper(node);
    });

    // Hover: highlight neighbors
    sigma.on("enterNode", ({ node }) => {
      hoveredNodeRef.current = node;
      sigma.refresh();
    });

    sigma.on("leaveNode", () => {
      hoveredNodeRef.current = null;
      sigma.refresh();
    });

    sigmaRef.current = sigma;

    // Center camera on graph after a tick
    requestAnimationFrame(() => {
      const camera = sigma.getCamera();
      camera.animatedReset({ duration: 300 });
    });
    })();

    return () => {
      cancelled = true;
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papersKey, buildGraph, onSelectPaper]);

  // Update selected state without rebuilding
  useEffect(() => {
    if (sigmaRef.current) {
      sigmaRef.current.refresh();
    }
  }, [selectedPaperId]);

  if (papers.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 font-mono text-neutral-700">&lt;/&gt;</div>
          <p className="text-sm tracking-widest uppercase text-neutral-600">No papers yet</p>
          <p className="text-xs text-neutral-700 mt-2">Add a paper to begin mapping</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full" style={{ background: "#000000" }} />
  );
}
