import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { ensureLatestWeeklyReport, parseReport, WEEKDAYS } from "@/lib/reports/weekly";
import { usd } from "@/lib/reports/weekly-logic";
import { generateWeeklyReportNowAction } from "@/lib/actions/report-actions";

// Reports: every Weekly Report so far, newest first, with the monthly report
// one click away. Opening this page writes the week's report if it's due and
// the daily run hasn't reached this business yet.

export const metadata = { title: "Reports — MAIRO" };
export const maxDuration = 60;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const { failed } = await searchParams;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  await ensureLatestWeeklyReport(organizationId).catch((error) => console.error("Weekly report on open failed:", error));
  const [rows, settings] = await Promise.all([
    db.weeklyReport.findMany({ where: { organizationId }, orderBy: { weekStart: "desc" }, take: 26 }),
    db.reportSettings.findUnique({ where: { organizationId } }),
  ]);
  const reports = rows.map((r) => ({ row: r, data: parseReport(r.dataJson) })).filter((r) => r.data);
  const enabled = settings?.weeklyEnabled ?? true;
  const day = WEEKDAYS[settings?.deliveryDay ?? 1];

  async function generateNow() {
    "use server";
    // Redirects to the new report on success; comes back here saying so on failure.
    await generateWeeklyReportNowAction();
    redirect("/dashboard/reports?failed=1");
  }

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Reports</h1>
          <p className="mt-1 text-[14.5px] text-muted">
            {enabled ? `Your Mairo Weekly Report arrives every ${day}.` : "Weekly reports are switched off."}{" "}
            <Link href="/dashboard/settings/reports" className="text-violet-bright hover:text-white">
              Report settings
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={generateNow}>
            <button type="submit" className="min-h-[40px] rounded-lg bg-[#7c5cff] px-4 text-[13px] font-medium text-white hover:brightness-110">
              Create a report for the last 7 days
            </button>
          </form>
          <Link href="/dashboard/reports/monthly" className="inline-flex min-h-[40px] items-center rounded-lg border border-white/12 px-4 text-[13px] text-white/85 hover:border-white/30">
            Monthly report
          </Link>
        </div>
      </div>

      {failed && (
        <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-[13px] text-amber-200">
          Mairo couldn&rsquo;t write the report just now — usually Meta being slow. Try again in a minute.
        </p>
      )}

      {reports.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/[0.07] bg-field/80 p-8 text-center">
          <p className="text-[15px] text-white">No weekly reports yet</p>
          <p className="mt-1 text-[13.5px] text-muted">The first one arrives on {day} once a campaign has been running, or create one now.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {reports.map(({ row, data }) => {
            const c = data!.glance.current;
            return (
              <li key={row.id}>
                <Link href={`/dashboard/reports/weekly/${row.id}`} className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-field/80 p-4 transition hover:border-violet/40 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-white">{data!.period.label}</span>
                    <span className="block text-[12.5px] text-faint">
                      {data!.attention.length ? `${data!.attention.length} thing${data!.attention.length === 1 ? "" : "s"} needed attention` : "No major issues"}
                      {row.shareToken ? " · Shared with client" : ""}
                    </span>
                  </span>
                  <span className="grid grid-cols-4 gap-4 text-[12px] sm:w-[420px]">
                    <span><span className="block text-faint">Revenue</span><span className="tabular-nums text-white">{usd(c.revenueCents, true)}</span></span>
                    <span><span className="block text-faint">Spend</span><span className="tabular-nums text-white">{usd(c.spendCents, true)}</span></span>
                    <span><span className="block text-faint">ROAS</span><span className="tabular-nums text-white">{c.roas === null ? "—" : `${c.roas.toFixed(1)}x`}</span></span>
                    <span><span className="block text-faint">Health</span><span className="tabular-nums text-white">{data!.health.now?.score ?? "—"}</span></span>
                  </span>
                  <span className="text-[13px] text-violet-bright">Open report →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
