import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrg } from "@/lib/active-org";
import { parseReport } from "@/lib/reports/weekly";
import { ReportHeader, WeeklyReport, type ReportMode } from "@/components/reports/weekly-report";
import { SharePanel } from "@/components/reports/report-client";

// One Weekly Report, in the business's preferred view (or the one picked).

export const metadata = { title: "Weekly report — MAIRO" };

const MODES: { key: ReportMode; label: string }[] = [
  { key: "simple", label: "Simple" },
  { key: "advanced", label: "Advanced" },
  { key: "profit", label: "Profit First" },
];

export default async function WeeklyReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const active = await activeOrg();
  const organizationId = active?.id ?? session.user.organizationId;
  const { id } = await params;
  const { mode: asked } = await searchParams;

  const [row, settings, org] = await Promise.all([
    db.weeklyReport.findFirst({ where: { id, organizationId } }),
    db.reportSettings.findUnique({ where: { organizationId } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { parentId: true } }),
  ]);
  if (!row) notFound();
  const data = parseReport(row.dataJson);
  if (!data) notFound();

  const mode: ReportMode = MODES.some((m) => m.key === asked) ? (asked as ReportMode) : ((settings?.preferredMode as ReportMode) ?? "simple");
  const ids = [...data.plan.map((p) => p.decisionId), ...data.attention.map((a) => a.decisionId)].filter((x): x is string => Boolean(x));
  const pending = ids.length
    ? (await db.mairoDecision.findMany({ where: { id: { in: ids }, organizationId, status: "PENDING" }, select: { id: true } })).map((d) => d.id)
    : [];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link href="/dashboard/reports" className="text-[13px] text-muted hover:text-white">
        ← All reports
      </Link>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <ReportHeader data={data} />
        <div className="mb-5 flex w-fit rounded-xl border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Report view">
          {MODES.map((m) => (
            <Link
              key={m.key}
              href={`?mode=${m.key}`}
              aria-current={mode === m.key ? "page" : undefined}
              className={`min-h-[34px] rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition ${mode === m.key ? "bg-gradient-to-r from-[#7c5cff] to-[#6d4dff] text-white" : "text-muted hover:text-white"}`}
            >
              {m.label}
            </Link>
          ))}
        </div>
      </div>
      {/* A client account run by an agency: review, then share. */}
      {(active?.actingAsClient || org?.parentId) && (
        <div className="mb-4">
          <SharePanel reportId={row.id} token={row.shareToken} origin={origin} />
        </div>
      )}
      <WeeklyReport data={data} mode={mode} pendingDecisionIds={pending} />
      <p className="mt-6 text-[12px] text-faint">
        Written {row.generatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} from Meta&rsquo;s figures and MAIRO&rsquo;s own records. MAIRO can&rsquo;t promise results; it shows what the numbers support.
      </p>
    </div>
  );
}
