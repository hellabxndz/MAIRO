// The environment behind the signed-in app, the auth screens and the legal
// pages: MAIRO's night (#05070D) with electric-blue light falling from above,
// a faint cyan from the side, a hairline of light along the top edge, and a
// faint grain so the dark reads as a material rather than a flat fill.
//
// The restraint is the point. A dashboard is somewhere you work, and a
// backdrop that moves competes with the numbers someone is trying to read.
// So this is still — one paint on mount, no JavaScript, no compositing work
// for as long as the screen is open — and the light stays at the edges,
// away from the middle of the screen where the work is.

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export function AmbientSky() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[20] bg-paper" style={{ backgroundImage: "var(--mairo-atmosphere)" }}>
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(47,107,255,0.5),rgba(56,189,248,0.25),transparent)]" />
      <div className="absolute inset-0 opacity-[0.035] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}
