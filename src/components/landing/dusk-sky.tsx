// The hero's backdrop: a city at dusk behind a window, drawn with gradients
// and one SVG skyline — no photograph, so it loads instantly and stays sharp.

// Deterministic, so the server and the browser draw the same city.
function city() {
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const towers: { x: number; top: number; w: number; far: boolean }[] = [];
  // Two rows: a hazy far row, then a darker near row in front of it.
  for (const far of [true, false]) {
    for (let x = -20; x < 1420; ) {
      const w = 34 + rand() * 70;
      towers.push({ x, top: far ? 170 + rand() * 180 : 280 + rand() * 200, w, far });
      x += w + (far ? rand() * 6 : rand() * 18);
    }
  }
  const lights: { x: number; y: number; o: number }[] = [];
  for (const t of towers.filter((t) => !t.far)) {
    for (let y = t.top + 12; y < 590; y += 14) {
      for (let x = t.x + 6; x < t.x + t.w - 6; x += 10) {
        if (rand() < 0.16) lights.push({ x, y, o: 0.3 + rand() * 0.6 });
      }
    }
  }
  return { towers, lights };
}

export function DuskSky() {
  const { towers, lights } = city();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The sky: deep indigo overhead, a warm band on the horizon. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#07060f_0%,#120d2b_38%,#2a1640_62%,#6b2f4d_80%,#b0573f_92%,#0b0710_100%)] opacity-90" />
      <div className="absolute right-[-10%] top-[20%] h-[520px] w-[720px] rounded-full bg-[radial-gradient(closest-side,rgba(255,150,90,0.35),transparent)] blur-2xl" />
      <div className="absolute left-[-15%] top-[-10%] h-[600px] w-[800px] rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.22),transparent)] blur-2xl" />

      {/* The skyline, with lit windows. */}
      <svg viewBox="0 0 1400 600" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[78%] w-full opacity-80">
        <defs>
          <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1430" />
            <stop offset="100%" stopColor="#07060d" />
          </linearGradient>
        </defs>
        {towers.map((t, i) => (
          <rect key={i} x={t.x} y={t.top} width={t.w} height={600 - t.top} fill={t.far ? "#1d1535" : "url(#tower)"} opacity={t.far ? 0.7 : 1} />
        ))}
        {lights.map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width="3" height="4" fill="#ffc98a" opacity={w.o} />
        ))}
      </svg>

      {/* The room: dark foreground, a window frame, and a fade into the page. */}
      <div className="absolute inset-y-0 left-[58%] hidden w-px bg-white/[0.06] lg:block" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#05050b_0%,rgba(5,5,11,0.92)_32%,rgba(5,5,11,0.35)_62%,rgba(5,5,11,0.15)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#05050b]" />
    </div>
  );
}
