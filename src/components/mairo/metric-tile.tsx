import type { Comparison, MetricInfo } from "@/lib/analytics/metrics";

// One number, explained.
//
// Four lines, in the order somebody reads them: the plain-English name, the
// figure, what the figure means in a sentence, and how it moved. The acronym
// sits beside the name for the minority who already know it, rather than
// instead of the name for the majority who do not.
//
// The tooltip is a native `title` plus a visible dotted underline. A custom
// popover would look better and would also be unreachable on a phone, which is
// where half of this product is read — and the underline is what tells anybody
// the explanation exists at all.

const TONE: Record<Comparison["tone"], string> = {
  good: "text-live",
  bad: "text-warn",
  neutral: "text-faint",
};

export function MetricTile({
  info,
  value,
  comparison,
  large = false,
}: {
  info: MetricInfo;
  /** Already formatted, including the dash when there is nothing to show. */
  value: string;
  comparison?: Comparison;
  large?: boolean;
}) {
  // No figure means no sentence about the figure. "You spent — on advertising"
  // is worse than saying nothing.
  const hasValue = value !== "—" && value.trim().length > 0;

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span
          title={info.tooltip}
          className="cursor-help text-[11.5px] text-muted decoration-dotted underline-offset-[3px] [text-decoration-line:underline]"
        >
          {info.plain}
        </span>
        {info.short && (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">
            {info.short}
          </span>
        )}
      </p>

      <p
        className={`mt-1.5 font-medium leading-none text-white ${
          large ? "text-[24px] sm:text-[28px]" : "text-[18px] sm:text-[20px]"
        }`}
      >
        {value}
      </p>

      {hasValue && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">{info.reading(value)}</p>
      )}

      {comparison?.label && (
        <p className={`mt-1 text-[11.5px] ${TONE[comparison.tone]}`}>{comparison.label}</p>
      )}
    </div>
  );
}
