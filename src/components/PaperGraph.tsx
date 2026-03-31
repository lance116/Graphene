"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Paper, PaperConnection } from "@/lib/supabase";
import { decodeEntities } from "@/lib/entities";

const COLORS = [
  { fill: "rgba(99,130,255,0.06)", stroke: "rgba(99,130,255,0.20)", dot: "#6382ff" },
  { fill: "rgba(255,130,99,0.06)", stroke: "rgba(255,130,99,0.20)", dot: "#ff8263" },
  { fill: "rgba(99,255,170,0.06)", stroke: "rgba(99,255,170,0.20)", dot: "#63ffaa" },
  { fill: "rgba(255,220,99,0.06)", stroke: "rgba(255,220,99,0.20)", dot: "#ffdc63" },
  { fill: "rgba(190,99,255,0.06)", stroke: "rgba(190,99,255,0.20)", dot: "#be63ff" },
  { fill: "rgba(99,210,255,0.06)", stroke: "rgba(99,210,255,0.20)", dot: "#63d2ff" },
  { fill: "rgba(255,99,180,0.06)", stroke: "rgba(255,99,180,0.20)", dot: "#ff63b4" },
  { fill: "rgba(180,255,99,0.06)", stroke: "rgba(180,255,99,0.20)", dot: "#b4ff63" },
];

type Node = {
  id: string;
  title: string;
  category: string;
  colorIdx: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number; // connection count
};

type Edge = { a: string; b: string };

// --- Barnes-Hut Quadtree for O(n log n) repulsion ---
type QTNode = { x: number; y: number; mass: number; cx: number; cy: number; children: (QTNode | null)[]; isLeaf: boolean };

function buildQuadtree(nodes: Node[], x0: number, y0: number, x1: number, y1: number): QTNode | null {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) {
    return { x: nodes[0].x, y: nodes[0].y, mass: 1, cx: nodes[0].x, cy: nodes[0].y, children: [], isLeaf: true };
  }
  const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
  const quads: Node[][] = [[], [], [], []];
  for (const n of nodes) {
    const qi = (n.x < midX ? 0 : 1) + (n.y < midY ? 0 : 2);
    quads[qi].push(n);
  }
  const children = [
    buildQuadtree(quads[0], x0, y0, midX, midY),
    buildQuadtree(quads[1], midX, y0, x1, midY),
    buildQuadtree(quads[2], x0, midY, midX, y1),
    buildQuadtree(quads[3], midX, midY, x1, y1),
  ];
  let mass = 0, cx = 0, cy = 0;
  for (const c of children) {
    if (!c) continue;
    mass += c.mass;
    cx += c.cx * c.mass;
    cy += c.cy * c.mass;
  }
  cx /= mass; cy /= mass;
  return { x: midX, y: midY, mass, cx, cy, children, isLeaf: false };
}

function applyBarnesHut(node: Node, qt: QTNode, size: number, theta: number, repelStrength: number) {
  if (qt.isLeaf) {
    if (qt.x === node.x && qt.y === node.y) return;
    const dx = node.x - qt.cx, dy = node.y - qt.cy;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const force = repelStrength / (dist * dist);
    node.vx += (dx / dist) * force;
    node.vy += (dy / dist) * force;
    return;
  }
  const dx = node.x - qt.cx, dy = node.y - qt.cy;
  const dist = Math.sqrt(dx * dx + dy * dy) + 1;
  if (size / dist < theta) {
    // Treat as single body
    const force = (repelStrength * qt.mass) / (dist * dist);
    node.vx += (dx / dist) * force;
    node.vy += (dy / dist) * force;
  } else {
    for (const c of qt.children) {
      if (c) applyBarnesHut(node, c, size / 2, theta, repelStrength);
    }
  }
}

function buildNodes(papers: Paper[], connections: PaperConnection[], W: number, H: number) {
  const catMap = new Map<string, number>();
  let ci = 0;

  // Count connections per paper
  const degreeMap = new Map<string, number>();
  const nodeIds = new Set(papers.map((p) => p.id));
  const edges: Edge[] = connections
    .filter((c) => nodeIds.has(c.paper_a) && nodeIds.has(c.paper_b))
    .map((c) => ({ a: c.paper_a, b: c.paper_b }));

  for (const e of edges) {
    degreeMap.set(e.a, (degreeMap.get(e.a) || 0) + 1);
    degreeMap.set(e.b, (degreeMap.get(e.b) || 0) + 1);
  }

  const nodes: Node[] = papers.map((p) => {
    const cats = (p.categories as string[]) || [];
    const cat = cats[0] || "Other";
    if (!catMap.has(cat)) catMap.set(cat, ci++);
    const colorIdx = catMap.get(cat)! % COLORS.length;

    const angle = (catMap.get(cat)! / Math.max(ci, 1)) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 150 + Math.random() * 100;

    return {
      id: p.id,
      title: decodeEntities(p.title),
      category: cat,
      colorIdx,
      x: W / 2 + Math.cos(angle) * dist,
      y: H / 2 + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      degree: degreeMap.get(p.id) || 0,
    };
  });

  return { nodes, edges };
}

function simulate(nodes: Node[], edges: Edge[], W: number, H: number) {
  const map = new Map(nodes.map((n) => [n.id, n]));

  // Barnes-Hut repulsion (O(n log n))
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const pad = 100;
  const qt = buildQuadtree(nodes, minX - pad, minY - pad, maxX + pad, maxY + pad);
  const size = Math.max(maxX - minX, maxY - minY) + pad * 2;
  if (qt) {
    for (const n of nodes) {
      applyBarnesHut(n, qt, size, 0.7, 1200);
    }
  }

  // Edge attraction
  for (const e of edges) {
    const a = map.get(e.a), b = map.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const force = (dist - 100) * 0.004;
    a.vx += (dx / dist) * force; a.vy += (dy / dist) * force;
    b.vx -= (dx / dist) * force; b.vy -= (dy / dist) * force;
  }

  // Center gravity
  for (const n of nodes) {
    n.vx += (W / 2 - n.x) * 0.0008;
    n.vy += (H / 2 - n.y) * 0.0008;
  }

  // Apply + damping
  for (const n of nodes) {
    n.vx *= 0.82; n.vy *= 0.82;
    n.x += n.vx; n.y += n.vy;
    n.x = Math.max(40, Math.min(W - 40, n.x));
    n.y = Math.max(40, Math.min(H - 40, n.y));
  }
}

// Get the connected neighbor IDs for a given node
function getNeighbors(nodeId: string, edges: Edge[]): Set<string> {
  const neighbors = new Set<string>();
  for (const e of edges) {
    if (e.a === nodeId) neighbors.add(e.b);
    if (e.b === nodeId) neighbors.add(e.a);
  }
  return neighbors;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef(selectedPaperId);
  selectedRef.current = selectedPaperId;
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const panRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const settledRef = useRef(false);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build graph data
  const papersKey = useMemo(() => papers.map(p => p.id).sort().join(","), [papers]);
  useEffect(() => {
    const existingIds = new Set(nodesRef.current.map(n => n.id));
    const newIds = new Set(papers.map(p => p.id));
    const same = existingIds.size === newIds.size && [...existingIds].every(id => newIds.has(id));
    if (same && nodesRef.current.length > 0) return;

    const { nodes, edges } = buildNodes(papers, connections, dims.w, dims.h);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    settledRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papersKey]);

  const toWorld = useCallback((sx: number, sy: number) => {
    const p = panRef.current;
    return { x: (sx - p.x) / p.scale, y: (sy - p.y) / p.scale };
  }, []);

  const findNode = useCallback((sx: number, sy: number): Node | null => {
    const { x, y } = toWorld(sx, sy);
    // Check larger nodes first (they have bigger hit areas)
    const sorted = [...nodesRef.current].sort((a, b) => b.degree - a.degree);
    for (const n of sorted) {
      const r = 4 + n.degree * 1.5;
      const hitR = Math.max(r + 5, 12);
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy < hitR * hitR) return n;
    }
    return null;
  }, [toWorld]);

  // Mouse handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (dragRef.current) {
        panRef.current.x = dragRef.current.panX + (e.clientX - dragRef.current.startX);
        panRef.current.y = dragRef.current.panY + (e.clientY - dragRef.current.startY);
        return;
      }
      const node = findNode(sx, sy);
      hoveredRef.current = node?.id || null;
      canvas.style.cursor = node ? "pointer" : "grab";
    };

    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const node = findNode(sx, sy);
      if (node) {
        onSelectPaper(node.id);
      } else {
        dragRef.current = {
          startX: e.clientX, startY: e.clientY,
          panX: panRef.current.x, panY: panRef.current.y,
        };
        canvas.style.cursor = "grabbing";
      }
    };

    const onMouseUp = () => { dragRef.current = null; canvas.style.cursor = "grab"; };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const p = panRef.current;
      const zoom = e.deltaY < 0 ? 1.1 : 0.9;

      const nodes = nodesRef.current;
      let minScale = 0.15;
      if (nodes.length > 0) {
        let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
        for (const n of nodes) {
          if (n.x < mnX) mnX = n.x;
          if (n.x > mxX) mxX = n.x;
          if (n.y < mnY) mnY = n.y;
          if (n.y > mxY) mxY = n.y;
        }
        const gW = mxX - mnX + 200, gH = mxY - mnY + 200;
        minScale = Math.max(0.15, Math.min(rect.width / gW, rect.height / gH) * 0.8);
      }

      const newScale = Math.max(minScale, Math.min(5, p.scale * zoom));
      p.x = mx - (mx - p.x) * (newScale / p.scale);
      p.y = my - (my - p.y) * (newScale / p.scale);
      p.scale = newScale;
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [findNode, onSelectPaper]);

  // Canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = dims.w + "px";
    canvas.style.height = dims.h + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [dims]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let simSteps = 0;
    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      const W = dims.w, H = dims.h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!settledRef.current && simSteps < 300) {
        simulate(nodesRef.current, edgesRef.current, W, H);
        simSteps++;
        if (simSteps >= 300) settledRef.current = true;
      }

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const map = new Map(nodes.map((n) => [n.id, n]));
      const p = panRef.current;

      // Determine highlight state
      const activeId = hoveredRef.current || selectedRef.current;
      const neighbors = activeId ? getNeighbors(activeId, edges) : null;
      const isHighlighted = (id: string) => !activeId || id === activeId || neighbors?.has(id);

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.scale, p.scale);

      // Cluster backgrounds (subtle)
      const clusters = new Map<string, Node[]>();
      for (const n of nodes) {
        const arr = clusters.get(n.category) || [];
        arr.push(n);
        clusters.set(n.category, arr);
      }

      clusters.forEach((cnodes) => {
        if (cnodes.length < 2) return;
        const ci = cnodes[0].colorIdx;
        const color = COLORS[ci];
        const cx = cnodes.reduce((s, n) => s + n.x, 0) / cnodes.length;
        const cy = cnodes.reduce((s, n) => s + n.y, 0) / cnodes.length;
        let maxD = 0;
        for (const n of cnodes) {
          const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
          if (d > maxD) maxD = d;
        }
        const r = Math.min(Math.max(maxD + 60, 80), 300);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = activeId ? color.fill.replace("0.06", "0.02") : color.fill;
        ctx.fill();
      });

      // Edges
      for (const e of edges) {
        const a = map.get(e.a), b = map.get(e.b);
        if (!a || !b) continue;
        const edgeActive = activeId && (e.a === activeId || e.b === activeId);
        ctx.strokeStyle = edgeActive
          ? COLORS[a.colorIdx].dot.replace(")", ",0.4)").replace("rgb", "rgba")
          : activeId ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.07)";
        ctx.lineWidth = edgeActive ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes
      const maxDegree = Math.max(1, ...nodes.map(n => n.degree));
      for (const n of nodes) {
        const isSel = n.id === selectedRef.current;
        const isHov = n.id === hoveredRef.current;
        const highlighted = isHighlighted(n.id);
        const alpha = highlighted ? 1 : 0.12;

        // Size: base 4px, scales with degree
        const baseR = 4 + (n.degree / maxDegree) * 8;
        const r = isSel ? baseR + 3 : isHov ? baseR + 2 : baseR;

        const color = COLORS[n.colorIdx].dot;

        // Glow for active nodes
        if ((isSel || isHov) && highlighted) {
          const grad = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 15);
          grad.addColorStop(0, color.replace(")", ",0.25)").replace("rgb", "rgba").replace("#", ""));
          grad.addColorStop(1, "rgba(0,0,0,0)");
          // Convert hex to rgba for glow
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 15, 0, Math.PI * 2);
          ctx.fillStyle = `${color}33`;
          ctx.fill();
        }

        // Dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = isSel ? "#ffffff" : color;
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Labels — LoD: fade based on zoom × importance
      const labelThreshold = 0.6; // min zoom × importance to show label
      for (const n of nodes) {
        const isSel = n.id === selectedRef.current;
        const isHov = n.id === hoveredRef.current;
        const highlighted = isHighlighted(n.id);
        const importance = (n.degree + 1) / (maxDegree + 1); // 0-1
        const visibility = p.scale * (0.3 + importance * 0.7);

        // Always show labels for active/hovered, otherwise LoD
        const showLabel = isSel || isHov || (highlighted && visibility > labelThreshold);
        if (!showLabel) continue;

        const baseR = 4 + (n.degree / maxDegree) * 8;
        const r = isSel ? baseR + 3 : isHov ? baseR + 2 : baseR;
        const active = isSel || isHov;

        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const fs = active ? Math.max(11, 11 / p.scale) : Math.max(8, 9 / p.scale);
        ctx.font = `${active ? "600 " : ""}${fs}px JetBrains Mono, monospace`;
        const maxW = active ? 240 : 100;
        let label = n.title;
        while (ctx.measureText(label).width > maxW && label.length > 8) {
          label = label.slice(0, -4) + "...";
        }

        const labelY = n.y + r + 4;
        const labelAlpha = active ? 1 : Math.min(1, (visibility - labelThreshold) / 0.4) * (highlighted ? 0.7 : 0.15);

        if (active) {
          const tw = ctx.measureText(label).width;
          const px = 6, py = 3;
          ctx.fillStyle = "rgba(0,0,0,0.9)";
          const rx = n.x - tw / 2 - px, ry = labelY - py;
          const rw = tw + px * 2, rh = fs + py * 2, cr = 3;
          ctx.beginPath();
          ctx.moveTo(rx + cr, ry);
          ctx.lineTo(rx + rw - cr, ry);
          ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + cr);
          ctx.lineTo(rx + rw, ry + rh - cr);
          ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - cr, ry + rh);
          ctx.lineTo(rx + cr, ry + rh);
          ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - cr);
          ctx.lineTo(rx, ry + cr);
          ctx.quadraticCurveTo(rx, ry, rx + cr, ry);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, n.x, labelY);
        } else {
          ctx.globalAlpha = labelAlpha;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillText(label, n.x + 0.5, labelY + 0.5);
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.fillText(label, n.x, labelY);
          ctx.globalAlpha = 1;
        }
      }

      // Category labels on clusters
      clusters.forEach((cnodes, cat) => {
        if (cnodes.length < 2) return;
        const ci = cnodes[0].colorIdx;
        const color = COLORS[ci];
        const cx = cnodes.reduce((s, n) => s + n.x, 0) / cnodes.length;
        const cy = cnodes.reduce((s, n) => s + n.y, 0) / cnodes.length;
        let maxD = 0;
        for (const n of cnodes) {
          const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
          if (d > maxD) maxD = d;
        }
        const r = Math.min(Math.max(maxD + 60, 80), 300);

        const fs = Math.max(9, 10 / p.scale);
        ctx.font = `700 ${fs}px JetBrains Mono, monospace`;
        ctx.textAlign = "center";
        ctx.globalAlpha = activeId ? 0.15 : 0.4;
        ctx.fillStyle = color.stroke;
        ctx.fillText(cat.toUpperCase(), cx, cy - r + 14);
        ctx.globalAlpha = 1;
      });

      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animRef.current);
  }, [dims]);

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
    <div ref={containerRef} className="w-full h-full bg-black">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
