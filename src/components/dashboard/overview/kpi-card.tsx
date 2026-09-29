import type { ReactNode } from "react";
import { PANEL } from "./format";

// One figure, how it moved against the period before, and whether that move
// was good. A cost going down is good, so it is green.

export function KpiCard({
  label,
  value,
  change,
  goodWhen = "up",
  icon,
  hint,
  compact = false,
}: {
  label: string;
  value: string;
  /** Fraction, e.g. 0.12 for +12%. Null when there's no fair comparison. */
  change: number | null;
  goodWhen?: "up" | "down";
  icon: ReactNode;
  /** Plain meaning, shown on hover. */
  hint?: string;
  /** Nine across in Advanced: a little smaller so they fit on one row. */
  compact?: boolean;
}) {
  const up = change !== null && change > 0;
  const flat = change === null || Math.abs(change) < 0.005;
  const good = !flat && (goodWhen === "up" ? up : !up);
  return (
    <div className={`${PANEL} min-w-0 ${compact ? "p-3.5" : "p-4"}`} title={hint}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet/15 text-violet-bright">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
          {icon}
        </svg>
      </span>
      <p className={`mt-3 truncate text-muted ${compact ? "text-[12px]" : "text-[12.5px]"}`}>{label}</p>
      <p className={`mt-0.5 truncate font-semibold tabular-nums tracking-tight text-white ${compact ? "text-[19px]" : "text-[22px]"}`}>{value}</p>
      <p className={`mt-1 text-[12.5px] font-medium tabular-nums ${flat ? "text-faint" : good ? "text-live" : "text-alert"}`}>
        {change === null ? "—" : flat ? "No change" : `${up ? "↑" : "↓"} ${Math.abs(Math.round(change * 100))}%`}
      </p>
      <p className={`mt-0.5 truncate text-faint ${compact ? "text-[11px]" : "text-[11.5px]"}`}>{compact ? "vs. prior period" : "vs. previous period"}</p>
    </div>
  );
}

/** The icons the stat cards use. */
export const KPI_ICON = {
  money: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 2.1c1.6.4 2.8.9 2.8 2.1s-1.2 2-2.8 2c-1.3 0-2.4-.5-2.9-1.4M12 6.3v11.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  cursor: <path d="M6 4l12 6.5-5.2 1.5L10.5 17z" />,
  percent: <path d="M18 6 6 18M8 8.5a1.5 1.5 0 1 0 0-.01M16 16.5a1.5 1.5 0 1 0 0-.01" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4M12 7.5v2M12 15.5v1.5" />
    </>
  ),
  bars: <path d="M5 19v-6M10 19V9M15 19v-9M20 19V5" />,
  cart: (
    <>
      <path d="M3 4h2.5l2.2 10.5h10.2L20 7.5H7" />
      <circle cx="9" cy="19" r="1.3" />
      <circle cx="17" cy="19" r="1.3" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.5 12 4h8v8l-8.5 8.5z" />
      <circle cx="16" cy="8" r="1.3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 5.8a3 3 0 0 1 0 5.6M18 14.4c1.6.6 2.6 2.2 2.6 4.6" />
    </>
  ),
  trend: <path d="M4 17l5.5-5.5 3.5 3.5L20 8M15 8h5v5" />,
};
