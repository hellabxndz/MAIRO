"use client";

import { useRef } from "react";

// A stylized neural-network "brain" visual for the marketing hero. Pure SVG +
// CSS animation for the pulsing, plus a light cursor-tracked parallax tilt —
// no canvas/WebGL, so it server-renders its markup and costs nothing idle.

type Node = { x: number; y: number; r: number; delay: number };

const NODES: Node[] = [
  { x: 300, y: 220, r: 7, delay: 0 },
  { x: 180, y: 140, r: 4, delay: 0.4 },
  { x: 420, y: 130, r: 4, delay: 0.9 },
  { x: 120, y: 260, r: 3, delay: 1.3 },
  { x: 470, y: 250, r: 3, delay: 0.2 },
  { x: 220, y: 340, r: 5, delay: 1.7 },
  { x: 380, y: 350, r: 5, delay: 0.7 },
  { x: 300, y: 90, r: 3, delay: 2.1 },
  { x: 90, y: 190, r: 3, delay: 1.1 },
  { x: 510, y: 170, r: 3, delay: 1.9 },
  { x: 300, y: 400, r: 4, delay: 0.5 },
  { x: 160, y: 400, r: 3, delay: 2.4 },
  { x: 440, y: 400, r: 3, delay: 1.5 },
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 5], [0, 6], [1, 3], [1, 8], [2, 4], [2, 9],
  [3, 5], [4, 6], [5, 6], [5, 10], [5, 11], [6, 10], [6, 12],
  [1, 7], [2, 7], [0, 7], [8, 3], [9, 4], [10, 11], [10, 12],
];

export function NeuralBrain({ className = "" }: { className?: string }) {
  const groupRef = useRef<SVGGElement>(null);
  const frame = useRef<number | null>(null);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;

    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      groupRef.current?.style.setProperty(
        "transform",
        `rotateX(${-py * 10}deg) rotateY(${px * 14}deg) translate(${px * 10}px, ${py * 10}px)`
      );
    });
  };

  const handleLeave = () => {
    groupRef.current?.style.setProperty("transform", "rotateX(0deg) rotateY(0deg) translate(0,0)");
  };

  return (
    <svg
      viewBox="0 0 600 480"
      className={className}
      role="img"
      aria-label="Animated neural network visualization"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ perspective: 900 }}
    >
      <defs>
        <radialGradient id="nb-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nb-edge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <filter id="nb-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        ref={groupRef}
        style={{
          transformOrigin: "300px 240px",
          transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <circle cx={300} cy={220} r={90} fill="url(#nb-core)" opacity={0.35} />

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
          {NODES.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={i === 0 ? "#f5f3ff" : "#a5b4fc"}
              className="nb-node"
              style={{ animationDelay: `${n.delay}s` }}
            />
          ))}
        </g>
      </g>

      <style>{`
        .nb-node {
          animation: nb-pulse 3.2s ease-in-out infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        .nb-edge {
          animation: nb-flow 4s ease-in-out infinite;
        }
        @keyframes nb-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.35); }
        }
        @keyframes nb-flow {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.6; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nb-node, .nb-edge { animation: none; }
        }
      `}</style>
    </svg>
  );
}
