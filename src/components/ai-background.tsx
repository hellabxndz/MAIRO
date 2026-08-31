// Living, flowing background for pages that want the "AI system at work"
// feel without the marketing-page neural brain. Layered gradient orbs
// drifting at different speeds (depth), flowing data-stream lines, and
// drifting particles — pure CSS/SVG, server-renderable, no JS needed.

const PARTICLES = [
  { x: 8, y: 20, delay: 0, dur: 14 },
  { x: 18, y: 70, delay: 2, dur: 18 },
  { x: 30, y: 35, delay: 4, dur: 16 },
  { x: 45, y: 85, delay: 1, dur: 20 },
  { x: 58, y: 15, delay: 3, dur: 15 },
  { x: 70, y: 55, delay: 5, dur: 19 },
  { x: 82, y: 25, delay: 2.5, dur: 17 },
  { x: 90, y: 75, delay: 0.5, dur: 21 },
  { x: 25, y: 55, delay: 6, dur: 13 },
  { x: 65, y: 90, delay: 3.5, dur: 22 },
];

export function AiBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
      {/* Depth-layered light sources, each drifting on its own slow orbit — kept to a
          near-monochrome white/gray so accent color stays sparing across the site. */}
      <div className="absolute left-[10%] top-[-10%] h-[45vw] w-[45vw] max-w-[600px] max-h-[600px] rounded-full bg-white/[0.06] blur-[110px] ai-bg-drift-a" />
      <div className="absolute right-[5%] top-[20%] h-[38vw] w-[38vw] max-w-[500px] max-h-[500px] rounded-full bg-slate-400/[0.05] blur-[110px] ai-bg-drift-b" />
      <div className="absolute left-[20%] bottom-[-10%] h-[35vw] w-[35vw] max-w-[460px] max-h-[460px] rounded-full bg-white/[0.04] blur-[110px] ai-bg-drift-c" />

      {/* Flowing data-stream lines */}
      <svg className="absolute inset-0 h-full w-full opacity-30" preserveAspectRatio="none">
        <defs>
          <linearGradient id="aib-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-100,120 C200,80 400,200 800,140" stroke="url(#aib-line)" strokeWidth="1" fill="none" className="ai-bg-flow" style={{ animationDelay: "0s" }} />
        <path d="M-100,320 C250,380 450,260 900,340" stroke="url(#aib-line)" strokeWidth="1" fill="none" className="ai-bg-flow" style={{ animationDelay: "1.5s" }} />
        <path d="M-100,520 C300,460 500,560 900,500" stroke="url(#aib-line)" strokeWidth="1" fill="none" className="ai-bg-flow" style={{ animationDelay: "3s" }} />
      </svg>

      {/* Drifting particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-white/50 ai-bg-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}

      {/* Grid, matching the landing page */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]" />

      <style>{`
        .ai-bg-drift-a {
          animation: ai-drift-a 26s ease-in-out infinite;
        }
        .ai-bg-drift-b {
          animation: ai-drift-b 32s ease-in-out infinite;
        }
        .ai-bg-drift-c {
          animation: ai-drift-c 38s ease-in-out infinite;
        }
        @keyframes ai-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(4%, 6%) scale(1.08); }
          66% { transform: translate(-3%, 3%) scale(0.96); }
        }
        @keyframes ai-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-6%, 5%) scale(1.1); }
        }
        @keyframes ai-drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(5%, -4%) scale(1.05); }
        }
        .ai-bg-flow {
          stroke-dasharray: 8 400;
          animation: ai-flow 6s linear infinite;
        }
        @keyframes ai-flow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -800; }
        }
        .ai-bg-particle {
          animation: ai-particle-drift linear infinite;
          box-shadow: 0 0 6px 1px rgba(255,255,255,0.35);
        }
        @keyframes ai-particle-drift {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-60px) translateX(20px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-bg-drift-a, .ai-bg-drift-b, .ai-bg-drift-c, .ai-bg-flow, .ai-bg-particle {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
