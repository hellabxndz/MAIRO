// A small trend line for a metric card: the shape of the period, not a
// chart to read values from (the card's number is the value). Drawn once,
// left to right, unless motion is reduced. Fewer than two real points draw
// nothing — a flat line would claim a trend that isn't there.

export function Sparkline({ points, width = 120, height = 34, tone = "signal", label }: { points: (number | null)[]; width?: number; height?: number; tone?: "signal" | "live" | "alert" | "muted"; label?: string }) {
  const real = points.map((p, i) => [i, p] as const).filter((x): x is readonly [number, number] => x[1] !== null && Number.isFinite(x[1]));
  if (real.length < 2) return null;
  const max = Math.max(...real.map(([, v]) => v));
  const min = Math.min(...real.map(([, v]) => v));
  const span = max - min || 1;
  const n = points.length - 1 || 1;
  const xy = real.map(([i, v]) => [(i / n) * (width - 2) + 1, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const line = xy.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${line}L${xy[xy.length - 1][0].toFixed(1)},${height}L${xy[0][0].toFixed(1)},${height}Z`;
  const color = { signal: "var(--color-signal)", live: "var(--color-live)", alert: "var(--color-alert)", muted: "var(--color-neutral-500)" }[tone];
  const id = `spark-${tone}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="overflow-visible" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} className="mairo-spark-fill" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="mairo-spark-line" />
    </svg>
  );
}
