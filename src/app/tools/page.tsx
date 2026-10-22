import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { ToolsHub, type HubTool } from "@/components/tools/tools-hub";
import { brandFont } from "@/lib/fonts";
import { TOOL_CATEGORIES, TOOLS, usable } from "@/lib/tools/registry";

export const metadata: Metadata = {
  title: "Free advertising tools for small businesses",
  description: "Free calculators and copy tools for Facebook and Instagram ads: break-even ROAS, cost per lead, budget planning, ad hooks, creative briefs, UTM links and more. No account needed.",
  alternates: { canonical: "/tools" },
};

export default function ToolsPage() {
  const tools: HubTool[] = TOOLS.map((t) => ({ slug: t.slug, name: t.name, summary: t.summary, category: t.category, processing: t.processing, keywords: t.keywords, usable: usable(t), partial: t.status === "partial" }));
  return (
    <div className={`${brandFont.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav toolsLive />
      <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-[110px] sm:px-8 sm:pt-[130px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Free tools</p>
        <h1 className="mt-3 max-w-[760px] text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[46px]">Work out your numbers and your first ads — free.</h1>
        <p className="mt-4 max-w-[680px] text-[16px] leading-relaxed text-white/75">
          Calculators and copy tools for Facebook and Instagram advertising. No account, no email. The calculators run in your browser: what you type stays on your device.
        </p>
        <div className="mt-10">
          <ToolsHub tools={tools} categories={TOOL_CATEGORIES} />
        </div>
        <div className="mt-14 rounded-2xl border border-white/10 bg-gradient-to-br from-[#dfdfdf]/[0.08] to-[#cfcfcf]/[0.1] p-6 sm:p-8">
          <p className="text-[20px] font-semibold text-white">Want the whole plan, not just one number?</p>
          <p className="mt-2 max-w-[640px] text-[14.5px] leading-relaxed text-white/75">Your free MAIRO plan puts budget, audience, three creative directions, tracking and a testing schedule together for your business. Nothing is spent until you approve a campaign.</p>
          <Link href="/preview" className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-[#dfdfdf] to-[#cfcfcf] px-5 py-2.5 text-[14px] font-semibold text-black hover:brightness-110">
            Build My Free Ad Plan <span aria-hidden>→</span>
          </Link>
        </div>
      </main>
      <SiteFooter toolsLive />
    </div>
  );
}
