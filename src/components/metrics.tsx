// Shared formatting for ad performance figures.
//
// These numbers come back from Meta as strings and in wildly different shapes —
// spend as "4.17", impressions as "1043", ctr as "1.9184". Formatting them at
// the point of display, once, keeps every screen consistent and keeps the
// "hasn't run yet" case from being rendered as a confident zero.

export function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** The dash shown wherever a figure genuinely does not exist yet. */
export const NO_VALUE = "—";

export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-l border-white/15 pl-4">
      <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className="mt-1.5 text-2xl font-medium tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}
