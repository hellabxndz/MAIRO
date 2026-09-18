import Link from "next/link";
import type { AutomationLevel } from "@/generated/prisma/enums";
import { automaticActions, levelInfo } from "@/lib/automation/levels";
import { GlassPanel } from "@/components/mairo";

// Where the money is, and who is allowed to move it.
//
// Advertising spends a customer's money continuously, in the background, on a
// schedule nobody watches. The single most important thing this product can do
// for somebody's confidence is put four numbers and one permission on the same
// card: what has gone out, what goes out a day, what the month allows, and
// what MAIRO may do to any of it without asking.
//
// Every figure is real or absent. A budget nobody has set shows a dash, not a
// zero and not an estimate — this is the card people will check before
// deciding whether to trust the automation, so a confident wrong number here
// costs more than a missing one.

export type SpendFigures = {
  /** Spent so far, over whatever window the dashboard is reporting. */
  spentCents: number | null;
  /** Total daily budget across everything currently running. */
  dailyCents: number | null;
  /** What the business said it wanted to spend a month, at signup. */
  monthlyCents: number | null;
};

function money(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function SpendControls({
  figures,
  level,
  className = "",
}: {
  figures: SpendFigures;
  level: AutomationLevel;
  className?: string;
}) {
  const info = levelInfo(level);
  const automatic = automaticActions(level);

  // Only when both sides are known. "Remaining" computed against a budget
  // nobody set is a made-up number on the card people trust most.
  const remaining =
    figures.monthlyCents !== null && figures.spentCents !== null
      ? Math.max(0, figures.monthlyCents - figures.spentCents)
      : null;

  const used =
    figures.monthlyCents !== null && figures.monthlyCents > 0 && figures.spentCents !== null
      ? Math.min(100, (figures.spentCents / figures.monthlyCents) * 100)
      : null;

  return (
    <GlassPanel className={`p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-medium text-white">Your spending</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            What has gone out, and what MAIRO may do without asking.
          </p>
        </div>
        <Link
          href="/dashboard/settings#automation"
          className="shrink-0 text-[12px] text-blue-bright transition-colors hover:text-white"
        >
          Change
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Spent" value={money(figures.spentCents)} />
        <Figure label="A day" value={money(figures.dailyCents)} />
        <Figure label="This month's budget" value={money(figures.monthlyCents)} />
        <Figure label="Left this month" value={money(remaining)} />
      </div>

      {used !== null && (
        <div className="mt-5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.07)" }}
            role="img"
            aria-label={`${Math.round(used)}% of this month's budget used`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-mairo)]"
              style={{ width: `${used}%`, backgroundImage: "var(--mairo-ramp)" }}
            />
          </div>
          <p className="mt-2 text-[11.5px] text-faint">
            {Math.round(used)}% of what you set for this month.
          </p>
        </div>
      )}

      <div
        className="mt-5 rounded-xl border p-4"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.02)" }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium"
            style={{
              background: level === "MANUAL" ? "rgba(255,255,255,0.06)" : "rgba(52,211,153,0.12)",
              color: level === "MANUAL" ? "rgb(203,213,225)" : "rgb(110,231,183)",
            }}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${level === "MANUAL" ? "bg-faint" : "bg-live"}`}
            />
            {info.label}
          </span>
          <p className="text-[12.5px] text-muted">{info.summary}</p>
        </div>

        {automatic.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {automatic.map((a) => (
              <li key={a.action} className="text-[11.5px] text-faint">
                {a.label}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
          MAIRO never raises your total budget, launches a campaign, spends past your ceiling
          or connects a platform without asking — at any setting.
        </p>
      </div>
    </GlassPanel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[19px] font-medium leading-none text-white sm:text-[22px]">{value}</p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{label}</p>
    </div>
  );
}
