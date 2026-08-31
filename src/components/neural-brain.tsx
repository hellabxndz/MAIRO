"use client";

import { useRef } from "react";

// A stylized, cursor-reactive neural-network "brain" visual for the
// marketing hero. Move your mouse over it: nearby nodes light up and scale,
// and a live web of connections draws from your cursor to the closest ones —
// like the network is sensing where you are. Pure SVG + refs (no React
// re-renders per mouse move, no canvas/WebGL).

type Node = { x: number; y: number; r: number; delay: number; hue: "violet" | "cyan" | "fuchsia" };

const NODES: Node[] = [
  { x: 300, y: 220, r: 8, delay: 0, hue: "violet" },
  { x: 180, y: 140, r: 4, delay: 0.4, hue: "cyan" },
  { x: 420, y: 130, r: 4, delay: 0.9, hue: "fuchsia" },
  { x: 120, y: 260, r: 3, delay: 1.3, hue: "cyan" },
  { x: 470, y: 250, r: 3, delay: 0.2, hue: "violet" },
  { x: 220, y: 340, r: 5, delay: 1.7, hue: "fuchsia" },
  { x: 380, y: 350, r: 5, delay: 0.7, hue: "cyan" },
  { x: 300, y: 90, r: 3, delay: 2.1, hue: "violet" },
  { x: 90, y: 190, r: 3, delay: 1.1, hue: "fuchsia" },
  { x: 510, y: 170, r: 3, delay: 1.9, hue: "cyan" },
  { x: 300, y: 400, r: 4, delay: 0.5, hue: "violet" },
  { x: 160, y: 400, r: 3, delay: 2.4, hue: "cyan" },
  { x: 440, y: 400, r: 3, delay: 1.5, hue: "fuchsia" },
  { x: 60, y: 320, r: 2.5, delay: 0.3, hue: "violet" },
  { x: 540, y: 330, r: 2.5, delay: 1.6, hue: "fuchsia" },
  { x: 250, y: 40, r: 2.5, delay: 2.6, hue: "cyan" },
  { x: 360, y: 40, r: 2.5, delay: 0.8, hue: "violet" },
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 5], [0, 6], [1, 3], [1, 8], [2, 4], [2, 9],
  [3, 5], [4, 6], [5, 6], [5, 10], [5, 11], [6, 10], [6, 12],
  [1, 7], [2, 7], [0, 7], [8, 3], [9, 4], [10, 11], [10, 12],
  [3, 13], [4, 14], [7, 15], [7, 16], [8, 13], [9, 14],
];

const SPARK_EDGES = [0, 3, 8, 12, 16, 20];

const HUE_FILL: Record<Node["hue"], string> = {
  violet: "#c4b5fd",
  cyan: "#67e8f9",
  fuchsia: "#f0abfc",
};

const VIEW_W = 600;
const VIEW_H = 480;
const REACT_RADIUS = 130; // how far a node "feels" the cursor, in viewBox units
const LINK_COUNT = 4; // how many of the nearest nodes get a live link to the cursor

export function NeuralBrain({ className = "" }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const linkRefs = useRef<(SVGLineElement | null)[]>([]);
  const cursorDotRef = useRef<SVGCircleElement>(null);
  const frame = useRef<number | null>(null);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const py = ((e.clientY - rect.top) / rect.height) * VIEW_H;

    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      cursorDotRef.current?.setAttribute("cx", String(px));
      cursorDotRef.current?.setAttribute("cy", String(py));
      cursorDotRef.current?.setAttribute("opacity", "1");

      const distances = NODES.map((n, i) => ({
        i,
        d: Math.hypot(n.x - px, n.y - py),
      })).sort((a, b) => a.d - b.d);

      NODES.forEach((n, i) => {
        const el = nodeRefs.current[i];
        if (!el) return;
        const d = Math.hypot(n.x - px, n.y - py);
        const proximity = Math.max(0, 1 - d / REACT_RADIUS);
        el.style.transform = `scale(${1 + proximity * 0.9})`;
        el.style.filter = proximity > 0.05 ? `brightness(${1 + proximity})` : "";
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
        link.setAttribute("opacity", String(0.7 * (1 - target.d / REACT_RADIUS)));
      }
    });
  };

  const handleLeave = () => {
    cursorDotRef.current?.setAttribute("opacity", "0");
    nodeRefs.current.forEach((el) => {
      if (!el) return;
      el.style.transform = "scale(1)";
      el.style.filter = "";
    });
    linkRefs.current.forEach((link) => link?.setAttribute("opacity", "0"));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      role="img"
      aria-label="Interactive neural network visualization — move your cursor over it"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <defs>
        <radialGradient id="nb-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="45%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nb-edge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>
        <filter id="nb-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g stroke="#a855f7" strokeOpacity={0.25} fill="none">
        <ellipse cx={300} cy={220} rx={170} ry={80} className="nb-orbit-a" strokeDasharray="2 8" />
        <ellipse cx={300} cy={220} rx={90} ry={160} className="nb-orbit-b" strokeDasharray="2 8" />
      </g>

      <circle cx={300} cy={220} r={100} fill="url(#nb-core)" opacity={0.4} className="nb-core" />

      <g stroke="url(#nb-edge)" strokeWidth={1} opacity={0.35}>
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            className="nb-edge"
            style={{ animationDelay: `${(i % 7) * 0.3}s` }}
          />
        ))}
      </g>

      <g filter="url(#nb-glow)">
        {SPARK_EDGES.map((edgeIndex, i) => {
          const [a, b] = EDGES[edgeIndex];
          return (
            <circle key={i} r={2} fill="#f5f3ff">
              <animateMotion
                dur={`${2.5 + i * 0.4}s`}
                repeatCount="indefinite"
                begin={`${i * 0.5}s`}
                path={`M${NODES[a].x},${NODES[a].y} L${NODES[b].x},${NODES[b].y}`}
              />
            </circle>
          );
        })}
      </g>

      {/* Live links from the cursor to the nearest nodes */}
      <g stroke="#f5f3ff" strokeWidth={1} filter="url(#nb-glow)">
        {Array.from({ length: LINK_COUNT }).map((_, i) => (
          <line key={i} ref={(el) => { linkRefs.current[i] = el; }} opacity={0} />
        ))}
      </g>

      <g filter="url(#nb-glow)">
        {NODES.map((n, i) => (
          <circle
            key={i}
            ref={(el) => { nodeRefs.current[i] = el; }}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={i === 0 ? "#f5f3ff" : HUE_FILL[n.hue]}
            className="nb-node"
            style={{ animationDelay: `${n.delay}s`, transformOrigin: `${n.x}px ${n.y}px` }}
          />
        ))}
        {/* The cursor's own point in the network */}
        <circle ref={cursorDotRef} r={4} fill="#ffffff" opacity={0} style={{ transition: "opacity 0.2s" }} />
      </g>

      <style>{`
        .nb-node {
          animation: nb-pulse 3.2s ease-in-out infinite;
          transition: transform 0.15s ease-out, filter 0.15s ease-out;
        }
        .nb-edge {
          animation: nb-flow 4s ease-in-out infinite;
        }
        .nb-core {
          animation: nb-breathe 5s ease-in-out infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        .nb-orbit-a {
          animation: nb-rotate 22s linear infinite;
          transform-origin: 300px 220px;
        }
        .nb-orbit-b {
          animation: nb-rotate-reverse 30s linear infinite;
          transform-origin: 300px 220px;
        }
        @keyframes nb-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes nb-flow {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.65; }
        }
        @keyframes nb-breathe {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50% { transform: scale(1.15); opacity: 0.5; }
        }
        @keyframes nb-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes nb-rotate-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .nb-node, .nb-edge, .nb-core, .nb-orbit-a, .nb-orbit-b { animation: none; }
        }
      `}</style>
    </svg>
  );
}
