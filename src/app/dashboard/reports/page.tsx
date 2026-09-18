import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { GlassPanel, HudLabel, MairoButton } from "@/components/mairo";
import { assistantNameOf } from "@/lib/ai/agents";
import {
  lastCompleteMonth,
  monthLabel,
  monthlyReport,
  type MonthKey,
} from "@/lib/reports/monthly";

// The month, on one page, in a form somebody would forward.
//
// Every figure here is the platforms' own reporting for that month, and where
// they reported nothing it says so. The one number with judgement in it — next
// month's suggested budget — shows its reasoning underneath, because a budget
// recommendation without a reason is just a bigger number.

export const metadata = { title: "Monthly report — MAIRO" };

function money(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** `?m=2026-08`, or last complete month. */
function parseMonth(raw: string | undefined): MonthKey {
  const match = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!match) return lastCompleteMonth();
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return lastCompleteMonth();
  return { year, month };
}

function monthParam({ year, month }: MonthKey): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function shift({ year, month }: MonthKey, by: number): MonthKey {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { m } = await searchParams;
  const key = parseMonth(m);

  const [org, report] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, assistantName: true },
    }),
    monthlyReport(organizationId, key),
  ]);
  const assistant = assistantNameOf(org?.assistantName);

  const previous = shift(key, -1);
  const next = shift(key, 1);
  // Never offer a month that has not finished.
  const latest = lastCompleteMonth();
  const canGoForward = next.year < latest.year || (next.year === latest.year && next.month <= latest.month);

  return (
    <div>
      <PageHeader
        title={`Your ${report.label} report`}
        description="What your advertising did last month, and what MAIRO suggests next."
        action={
          /* A plain anchor, not next/link. Link prefetches, and prefetching a
             route that streams a file attachment meant every visit to this
             page silently computed the whole report a second time — including
             its live calls to the ad platforms — on a request that could never
             resolve as an RSC payload. `download` also gives the file its name
             when the browser saves it. */
          <a
            href={`/api/reports/${monthParam(key)}`}
            download={`mairo-${monthParam(key)}.txt`}
            className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13px] text-white/85 transition-colors hover:border-[color:var(--mairo-line-lit)] hover:text-white"
            style={{ borderColor: "var(--mairo-line)" }}
          >
            Download
          </a>
        }
      />

      <nav className="mb-6 flex items-center gap-4" aria-label="Choose a month">
        <Link
          href={`/dashboard/reports?m=${monthParam(previous)}`}
          className="text-[12.5px] text-muted transition-colors hover:text-white"
        >
          ← {monthLabel(previous)}
        </Link>
        {canGoForward && (
          <Link
            href={`/dashboard/reports?m=${monthParam(next)}`}
            className="text-[12.5px] text-muted transition-colors hover:text-white"
          >
            {monthLabel(next)} →
          </Link>
        )}
      </nav>

      {report.thin ? (
        <GlassPanel className="px-6 py-14 text-center">
          <h2 className="text-[16px] font-medium text-white">Nothing ran in {report.label}</h2>
          <p className="mx-auto mt-2.5 max-w-md text-[13px] leading-relaxed text-muted">
            There is no report for a month with no advertising in it. Once a campaign has been
            live for a few days, this fills in on its own.
          </p>
          <div className="mt-6 flex justify-center">
            <MairoButton href="/dashboard/create">Create a campaign</MairoButton>
          </div>
        </GlassPanel>
      ) : (
        <>
          <GlassPanel lit className="p-5 sm:p-7">
            <HudLabel className="mb-5">The month</HudLabel>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Figure label="Advertising spend" value={money(report.spendCents)} />
              <Figure label="Revenue from ads" value={money(report.revenueCents)} />
              <Figure
                label="Return on ad spend"
                value={report.roas === null ? "—" : `${report.roas.toFixed(2)}×`}
              />
              <Figure
                label="Results"
                value={report.purchases === null ? "—" : report.purchases.toLocaleString("en-US")}
              />
            </div>

            <p className="mt-7 max-w-3xl text-[14px] leading-relaxed text-white/90">
              {report.summary}
            </p>
          </GlassPanel>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <GlassPanel className="p-5 sm:p-6">
              <HudLabel className="mb-5">What MAIRO did</HudLabel>
              <dl className="space-y-3.5">
                <Row label="Ads running this month" value={String(report.creativesTested)} />
                <Row label="Campaigns paused" value={String(report.adsPaused)} />
                <Row label="Changes MAIRO made" value={String(report.changesMade)} />
                <Row label="Cost per result" value={money(report.costPerPurchaseCents)} />
                <Row
                  label="Best platform"
                  value={
                    report.bestPlatform
                      ? `${report.bestPlatform.name} · ${money(report.bestPlatform.costPerPurchaseCents)}`
                      : "Not enough to compare"
                  }
                />
              </dl>
            </GlassPanel>

            <GlassPanel className="p-5 sm:p-6">
              <HudLabel className="mb-5">Next month</HudLabel>
              <p className="text-[28px] font-medium leading-none text-white">
                {money(report.recommendedNextCents)}
              </p>
              <p className="mt-2 text-[11.5px] text-faint">Recommended advertising budget</p>
              <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-muted">
                {report.recommendationWhy}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Link
                  href={`/dashboard/agents?ask=${encodeURIComponent(`Talk me through my ${report.label} report.`)}`}
                  className="text-[12.5px] text-blue-bright transition-colors hover:text-white"
                >
                  Ask {assistant} about this report →
                </Link>
              </div>
            </GlassPanel>
          </div>

          <p className="mt-8 max-w-3xl text-[11.5px] leading-relaxed text-faint">
            Figures come from the advertising platforms&rsquo; own reporting and may differ
            slightly from what they show in their dashboards. Where a platform reported
            nothing, this page shows a dash rather than a zero. MAIRO can&rsquo;t promise
            sales, leads or a particular return.
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[24px] font-medium leading-none text-white sm:text-[30px]">{value}</p>
      <p className="mt-2 text-[11.5px] leading-snug text-faint">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-right text-[13px] text-white">{value}</dd>
    </div>
  );
}
