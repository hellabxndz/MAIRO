import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseReport } from "@/lib/reports/weekly";
import { ReportHeader, WeeklyReport } from "@/components/reports/weekly-report";

// A client's weekly report, shared by their agency.
//
// Only reports the agency approved have a token, and turning the link off
// removes it. The version shown is client-facing: no buttons, and Mairo's
// internal notes left out unless the agency chose to include them.

export const metadata = { title: "Weekly report", robots: { index: false, follow: false } };

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const row = await db.weeklyReport.findUnique({
    where: { shareToken: token },
    include: { organization: { select: { name: true, parentId: true } } },
  });
  if (!row || !row.approvedAt) notFound();
  const data = parseReport(row.dataJson);
  if (!data) notFound();
  const brand = row.organization.parentId ? await db.reportSettings.findUnique({ where: { organizationId: row.organization.parentId } }) : null;

  return (
    <main className="min-h-screen bg-[#05070f] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <ReportHeader data={data} brandName={brand?.brandName} brandLogoUrl={brand?.brandLogoUrl} clientName={row.organization.name} />
        <WeeklyReport data={data} mode="simple" pendingDecisionIds={[]} clientFacing hideInternal={brand?.hideInternal ?? true} />
        <p className="mt-8 text-[12px] text-faint">Figures are Meta&rsquo;s reporting for the week. Estimates are labelled as estimates; no result is guaranteed.</p>
      </div>
    </main>
  );
}
