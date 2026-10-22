import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { AmbientSky } from "@/components/ambient-sky";
import { PlanReportView } from "@/components/plan-generator/plan-report";
import { brandFont } from "@/lib/fonts";
import { SHOP, SHOP_REPORT } from "@/lib/demo/shop-sample";
import { USABLE_TOOLS } from "@/lib/tools/registry";

// An example of the free AI ad plan: the generator's own report, built by
// its own report builder for the fictional shop the homepage's videos use —
// so the example a visitor opens is exactly what the generator makes, and
// says plainly that the business is invented.

export const metadata: Metadata = {
  title: "Example free AI ad plan",
  description: "An example of MAIRO's free AI ad plan, for a fictional online shop: strategy, budget split, ad concepts and a 30-day roadmap.",
};

export default function ExamplePlanPage() {
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-clip bg-paper text-white`}>
      <AmbientSky />
      <LandingNav toolsLive={toolsLive} />
      <main className="mp-print-root px-4 pb-20 pt-[104px] sm:px-8 sm:pt-[124px]">
        <div className="mp-noprint mx-auto mb-6 flex max-w-[1180px] flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] leading-relaxed text-white/70">
            <span className="font-semibold text-white">Example plan.</span> {SHOP.name} is a fictional online shop — this is the plan MAIRO&rsquo;s generator makes from its answers. No ads were launched and nothing was spent.
          </p>
          <Link href="/preview" className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-5 text-[14px] font-semibold text-black transition hover:brightness-110">
            Make one for your business <span aria-hidden>→</span>
          </Link>
        </div>
        <PlanReportView report={SHOP_REPORT} actions={null} />
      </main>
      <SiteFooter toolsLive={toolsLive} />
    </div>
  );
}
