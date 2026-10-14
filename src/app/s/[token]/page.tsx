import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { AmbientSky } from "@/components/ambient-sky";
import { PlanReportView } from "@/components/plan-generator/plan-report";
import { brandFont } from "@/lib/fonts";
import { readSharedPlan } from "@/lib/preview/saved-plan-store";
import { buildReport } from "@/lib/preview/report";
import { USABLE_TOOLS } from "@/lib/tools/registry";

// A free AI ad plan someone saved or shared: read-only, exactly as they saw
// it (lib/preview/report.ts rebuilds it from what was saved), with a way to
// make your own. Reachable only by its unguessable link, never listed or
// indexed; an unclaimed plan's link stops working after 30 days.

export const metadata: Metadata = { title: "A free AI ad plan", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await readSharedPlan(token);
  const report = shared ? buildReport(shared.plan) : null;
  if (!shared || !report) notFound();
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-hidden bg-paper text-white`}>
      <AmbientSky />
      <LandingNav toolsLive={USABLE_TOOLS().length > 0} />
      <main className="mp-print-root px-4 pb-20 pt-[104px] sm:px-8 sm:pt-[124px]">
        <p className="mp-noprint mx-auto mb-6 max-w-[1180px] rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/65">
          A plan made with MAIRO&rsquo;s free AI ad strategy generator and shared by its owner. It&rsquo;s a recommendation built from what they told MAIRO — no ads were launched and nothing was spent.{" "}
          <Link href="/preview" className="text-violet-200 underline underline-offset-2 hover:text-white">Make one for your business</Link>
        </p>
        <PlanReportView report={report} actions={null} savedAt={shared.createdAt.toISOString()} />
      </main>
      <SiteFooter toolsLive={USABLE_TOOLS().length > 0} />
    </div>
  );
}
