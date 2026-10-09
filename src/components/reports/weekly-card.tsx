import Link from "next/link";
import { usd } from "@/lib/reports/weekly-logic";
import type { WeeklyReportData } from "@/lib/reports/weekly-logic";

// The Weekly Report's card on the dashboard: ready, with the headline
// numbers, or when the next one arrives.

export function WeeklyReportCard({ report, nextDay, enabled }: { report: { id: string; data: WeeklyReportData; fresh: boolean } | null; nextDay: string; enabled: boolean }) {
  const ready = report?.fresh ? report : null;
  const c = ready?.data.glance.current;
  const actions = ready?.data.attention.length ?? 0;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-field/80 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Weekly report</p>
        {ready && c ? (
          <>
            <p className="mt-1 text-[16px] font-semibold text-white">Your report is ready.</p>
            <p className="text-[13px] text-muted">{ready.data.period.label}</p>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-white/85">
              <span>Revenue: <span className="font-semibold tabular-nums text-white">{usd(c.revenueCents, true)}</span></span>
              <span>ROAS: <span className="font-semibold tabular-nums text-white">{c.roas === null ? "—" : `${c.roas.toFixed(1)}x`}</span></span>
              <span className={actions ? "text-amber-300" : "text-muted"}>{actions ? `${actions} action${actions === 1 ? "" : "s"} need${actions === 1 ? "s" : ""} your attention.` : "No major issues."}</span>
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-[16px] font-semibold text-white">{enabled ? `Next report: ${nextDay}` : "Weekly reports are off"}</p>
            <p className="text-[13px] text-muted">{enabled ? "A two-minute summary of the week, what Mairo changed and learned, and what's next." : "Switch them on in Settings › Reports."}</p>
          </>
        )}
      </div>
      <Link
        href={ready ? `/dashboard/reports/weekly/${ready.id}` : enabled ? "/dashboard/reports" : "/dashboard/settings/reports"}
        className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white hover:brightness-110"
      >
        {ready ? "Open weekly report" : enabled ? "See reports" : "Report settings"} →
      </Link>
    </section>
  );
}
