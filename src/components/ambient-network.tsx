"use client";

import { useRef } from "react";

// A restrained, monochrome constellation used as an ambient background layer
// — not a hero centerpiece. White/gray only, one sparing accent on the
// cursor's live links. Nodes barely breathe; the only strong reaction is to
// the cursor, and even that stays subtle.

type NodePos = { x: number; y: number; r: number };

const NODES: NodePos[] = [
  { x: 300, y: 220, r: 2 }, { x: 140, y: 120, r: 1.4 }, { x: 460, y: 110, r: 1.4 },
  { x: 90, y: 260, r: 1.2 }, { x: 500, y: 260, r: 1.2 }, { x: 210, y: 340, r: 1.6 },
  { x: 390, y: 350, r: 1.6 }, { x: 300, y: 60, r: 1.2 }, { x: 60, y: 190, r: 1 },
  { x: 540, y: 170, r: 1 }, { x: 300, y: 420, r: 1.4 }, { x: 150, y: 420, r: 1 },
  { x: 450, y: 420, r: 1 }, { x: 30, y: 340, r: 0.9 }, { x: 570, y: 340, r: 0.9 },
  { x: 220, y: 20, r: 0.9 }, { x: 380, y: 20, r: 0.9 }, { x: 250, y: 180, r: 1 },
  { x: 350, y: 260, r: 1 }, { x: 180, y: 250, r: 1 },
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 5], [0, 6], [1, 3], [1, 8], [2, 4], [2, 9], [3, 5],
  [4, 6], [5, 6], [5, 10], [5, 11], [6, 10], [6, 12], [1, 7], [2, 7], [0, 7],
  [8, 3], [9, 4], [10, 11], [10, 12], [3, 13], [4, 14], [7, 15], [7, 16],
  [0, 17], [0, 18], [1, 19], [17, 18],
];

const VIEW_W = 600;
const VIEW_H = 480;
const REACT_RADIUS = 150;
const LINK_COUNT = 3;

export function AmbientNetwork({ className = "" }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const linkRefs = useRef<(SVGLineElement | null)[]>([]);
  const frame = useRef<number | null>(null);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const py = ((e.clientY - rect.top) / rect.height) * VIEW_H;

    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const distances = NODES.map((n, i) => ({ i, d: Math.hypot(n.x - px, n.y - py) })).sort(
        (a, b) => a.d - b.d
      );

      NODES.forEach((n, i) => {
        const el = nodeRefs.current[i];
        if (!el) return;
        const d = Math.hypot(n.x - px, n.y - py);
        const proximity = Math.max(0, 1 - d / REACT_RADIUS);
        el.style.opacity = String(0.3 + proximity * 0.7);
        el.style.transform = `scale(${1 + proximity * 0.6})`;
      });

      for (let k = 0; k < LINK_COUNT; k++) {
        const link = linkRefs.current[k];
        if (!link) continue;
        const target = distances[k];
        if (!target || target.d > REACT_RADIUS) {
          link.setAttribute("opacity", "0");
          continue;
        }
        const n = NODES[target.i];
        link.setAttribute("x1", String(px));
        link.setAttribute("y1", String(py));
        link.setAttribute("x2", String(n.x));
        link.setAttribute("y2", String(n.y));
        link.setAttribute("opacity", String(0.5 * (1 - target.d / REACT_RADIUS)));
      }
    });
  };

  const handleLeave = () => {
    nodeRefs.current.forEach((el) => {
      if (!el) return;
      el.style.opacity = "0.3";
      el.style.transform = "scale(1)";
    });
    linkRefs.current.forEach((l) => l?.setAttribute("opacity", "0"));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <g stroke="#ffffff" strokeWidth={0.5} opacity={0.12}>
        {EDGES.map(([a, b], i) => (
          <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
        ))}
      </g>

      <g stroke="#e0e7ff" strokeWidth={0.75}>
        {Array.from({ length: LINK_COUNT }).map((_, i) => (
          <line key={i} ref={(el) => { linkRefs.current[i] = el; }} opacity={0} />
        ))}
      </g>

      <g>
        {NODES.map((n, i) => (
          <circle
            key={i}
            ref={(el) => { nodeRefs.current[i] = el; }}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="#ffffff"
            opacity={0.3}
            className="an-node"
            style={{ transformOrigin: `${n.x}px ${n.y}px`, transition: "opacity 0.2s, transform 0.2s" }}
          />
        ))}
      </g>

      <style>{`
        .an-node { animation: an-breathe 6s ease-in-out infinite; }
        .an-node:nth-child(3n) { animation-delay: -2s; }
        .an-node:nth-child(3n+1) { animation-delay: -4s; }
        @keyframes an-breathe {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.45; }
        }
        @media (prefers-reduced-motion: reduce) {
          .an-node { animation: none; }
        }
      `}</style>
    </svg>
  );
}
