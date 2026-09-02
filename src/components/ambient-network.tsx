"use client";

import { useRef } from "react";

// A galaxy-toned, cursor-reactive constellation. Move your mouse over it:
// the nearest stars brighten and pull glowing violet/cyan threads to your
// cursor, like you've reached into the network.
//
// The glow is painted, not filtered. An <feGaussianBlur> over these nodes is
// the obvious way to write it and it was what this file did — but an SVG
// filter is a paint-time operation the compositor cannot cache, and this one
// declared a filter region of 300% in each direction, so roughly nine hero-
// sized areas of blur had to be recomputed every time the tiles underneath it
// were repainted. That cost nothing while the page behind it was still; the
// moment the backdrop started drifting it re-ran the blur every frame and took
// the whole page from 60fps to 16. Each node is now a soft radial-gradient
// halo with a crisp dot on top of it, which reads the same and is just two
// more shapes to draw once.

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

// How much wider the halo is than the star inside it.
const HALO_SCALE = 6;

const VIEW_W = 600;
const VIEW_H = 480;
const REACT_RADIUS = 190;
const LINK_COUNT = 5;

export function AmbientNetwork({ className = "" }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef<(SVGGElement | null)[]>([]);
  const linkRefs = useRef<(SVGLineElement | null)[]>([]);
  const linkGlowRefs = useRef<(SVGLineElement | null)[]>([]);
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
        const glow = linkGlowRefs.current[k];
        if (!link) continue;
        const target = distances[k];
        if (!target || target.d > REACT_RADIUS) {
          link.setAttribute("opacity", "0");
          glow?.setAttribute("opacity", "0");
          continue;
        }
        const n = NODES[target.i];
        const strength = 1 - target.d / REACT_RADIUS;
        for (const line of [link, glow]) {
          if (!line) continue;
          line.setAttribute("x1", String(px));
          line.setAttribute("y1", String(py));
          line.setAttribute("x2", String(n.x));
          line.setAttribute("y2", String(n.y));
        }
        link.setAttribute("opacity", String(0.75 * strength));
        // The bloom pass is faint on its own; stacked under the bright line it
        // reads as the same halo the blur used to give.
        glow?.setAttribute("opacity", String(0.16 * strength));
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
    linkGlowRefs.current.forEach((l) => l?.setAttribute("opacity", "0"));
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
        {(Object.keys(HUE_FILL) as NodePos["hue"][]).map((hue) => (
          <radialGradient key={hue} id={`an-halo-${hue}`}>
            <stop offset="0%" stopColor={HUE_FILL[hue]} stopOpacity={0.55} />
            <stop offset="35%" stopColor={HUE_FILL[hue]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={HUE_FILL[hue]} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>

      <g stroke="#c4b5fd" strokeWidth={0.6} opacity={0.18}>
        {EDGES.map(([a, b], i) => (
          <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
        ))}
      </g>

      {/* Each thread is drawn twice: a wide, faint pass for the bloom and a
          thin bright one over it. Two ordinary lines instead of a blur. */}
      <g stroke="url(#an-link)" strokeLinecap="round">
        {Array.from({ length: LINK_COUNT }).map((_, i) => (
          <line
            key={`glow-${i}`}
            ref={(el) => { linkGlowRefs.current[i] = el; }}
            strokeWidth={5}
            opacity={0}
          />
        ))}
        {Array.from({ length: LINK_COUNT }).map((_, i) => (
          <line
            key={i}
            ref={(el) => { linkRefs.current[i] = el; }}
            strokeWidth={1}
            opacity={0}
          />
        ))}
      </g>

      <g>
        {NODES.map((n, i) => (
          <g
            key={i}
            ref={(el) => { nodeRefs.current[i] = el; }}
            className="an-node"
            opacity={0.45}
            style={{ transformOrigin: `${n.x}px ${n.y}px`, transition: "opacity 0.2s, transform 0.2s" }}
          >
            <circle cx={n.x} cy={n.y} r={n.r * HALO_SCALE} fill={`url(#an-halo-${n.hue})`} />
            <circle cx={n.x} cy={n.y} r={n.r} fill={HUE_FILL[n.hue]} />
          </g>
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
