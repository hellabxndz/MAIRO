"use client";

import { useRef } from "react";

// A galaxy-toned, cursor-reactive constellation. Move your mouse over it:
// the nearest stars brighten and pull glowing violet/cyan threads to your
// cursor, like you've reached into the network.

type NodePos = { x: number; y: number; r: number; hue: "white" | "violet" | "cyan" };

const NODES: NodePos[] = [
  { x: 300, y: 220, r: 2.6, hue: "white" }, { x: 140, y: 120, r: 1.6, hue: "violet" },
  { x: 460, y: 110, r: 1.6, hue: "cyan" }, { x: 90, y: 260, r: 1.3, hue: "white" },
  { x: 500, y: 260, r: 1.3, hue: "violet" }, { x: 210, y: 340, r: 1.8, hue: "cyan" },
  { x: 390, y: 350, r: 1.8, hue: "white" }, { x: 300, y: 60, r: 1.3, hue: "violet" },
  { x: 60, y: 190, r: 1.1, hue: "cyan" }, { x: 540, y: 170, r: 1.1, hue: "white" },
  { x: 300, y: 420, r: 1.5, hue: "violet" }, { x: 150, y: 420, r: 1.1, hue: "cyan" },
  { x: 450, y: 420, r: 1.1, hue: "white" }, { x: 30, y: 340, r: 1, hue: "violet" },
  { x: 570, y: 340, r: 1, hue: "cyan" }, { x: 220, y: 20, r: 1, hue: "white" },
  { x: 380, y: 20, r: 1, hue: "violet" }, { x: 250, y: 180, r: 1.1, hue: "cyan" },
  { x: 350, y: 260, r: 1.1, hue: "white" }, { x: 180, y: 250, r: 1.1, hue: "violet" },
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 5], [0, 6], [1, 3], [1, 8], [2, 4], [2, 9], [3, 5],
  [4, 6], [5, 6], [5, 10], [5, 11], [6, 10], [6, 12], [1, 7], [2, 7], [0, 7],
  [8, 3], [9, 4], [10, 11], [10, 12], [3, 13], [4, 14], [7, 15], [7, 16],
  [0, 17], [0, 18], [1, 19], [17, 18],
];

const HUE_FILL: Record<NodePos["hue"], string> = {
  white: "#ffffff",
  violet: "#d8b4fe",
  cyan: "#a5f3fc",
};

const VIEW_W = 600;
const VIEW_H = 480;
const REACT_RADIUS = 190;
const LINK_COUNT = 5;

export function AmbientNetwork({ className = "" }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const linkRefs = useRef<(SVGLineElement | null)[]>([]);
  const frame = useRef<number | null>(null);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // preserveAspectRatio="xMidYMid slice" scales the viewBox uniformly to
    // COVER the element (like background-size: cover) and crops the
    // overflow — a plain (clientX/width)*VIEW_W mapping is only correct
    // when the element's aspect ratio happens to match the viewBox's. This
    // inverts the actual cover transform so hit-testing lines up regardless
    // of the element's shape.
    const scale = Math.max(rect.width / VIEW_W, rect.height / VIEW_H);
    const offsetX = (rect.width - VIEW_W * scale) / 2;
    const offsetY = (rect.height - VIEW_H * scale) / 2;
    const px = (e.clientX - rect.left - offsetX) / scale;
    const py = (e.clientY - rect.top - offsetY) / scale;

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
        el.style.opacity = String(0.45 + proximity * 0.55);
        el.style.transform = `scale(${1 + proximity * 1.4})`;
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
        link.setAttribute("opacity", String(0.75 * (1 - target.d / REACT_RADIUS)));
      }
    });
  };

  const handleLeave = () => {
    nodeRefs.current.forEach((el) => {
      if (!el) return;
      el.style.opacity = "0.45";
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
      <defs>
        <linearGradient id="an-link" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#d8b4fe" />
        </linearGradient>
        <filter id="an-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g stroke="#c4b5fd" strokeWidth={0.6} opacity={0.18}>
        {EDGES.map(([a, b], i) => (
          <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
        ))}
      </g>

      <g stroke="url(#an-link)" strokeWidth={1} filter="url(#an-glow)">
        {Array.from({ length: LINK_COUNT }).map((_, i) => (
          <line key={i} ref={(el) => { linkRefs.current[i] = el; }} opacity={0} />
        ))}
      </g>

      <g filter="url(#an-glow)">
        {NODES.map((n, i) => (
          <circle
            key={i}
            ref={(el) => { nodeRefs.current[i] = el; }}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={HUE_FILL[n.hue]}
            opacity={0.45}
            className="an-node"
            style={{ transformOrigin: `${n.x}px ${n.y}px`, transition: "opacity 0.2s, transform 0.2s" }}
          />
        ))}
      </g>

      {/* No idle "breathing" animation on these nodes. Continuously animating
          opacity on SVG children repaints this hero-sized SVG every frame and
          measured as roughly half the page's frame budget on desktop. The
          network still comes alive on cursor movement, which only paints while
          the pointer is actually moving. */}
    </svg>
  );
}
