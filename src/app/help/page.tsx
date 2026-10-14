import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { HelpSearch } from "@/components/help/help-search";
import { HelpContact } from "@/components/help/help-article";
import { brandFont } from "@/lib/fonts";
import { HELP_CATEGORIES, helpIndex } from "@/lib/help/articles";
import { USABLE_TOOLS } from "@/lib/tools/registry";

// The public help center. The same articles appear inside the dashboard at
// /dashboard/guide; these pages are for anyone, signed in or not.

export const metadata: Metadata = {
  title: "Help center",
  description: "How MAIRO works: your free plan, connecting Meta, tracking, approvals, results, credits and billing — answered from what the product actually does.",
  alternates: { canonical: "/help" },
};

export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const { q } = await searchParams;
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav toolsLive={toolsLive} />
      <main className="mx-auto max-w-[960px] px-4 pb-20 pt-[110px] sm:px-8 sm:pt-[130px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Help center</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[44px]">How can we help?</h1>
        <p className="mt-4 max-w-[640px] text-[16px] leading-relaxed text-white/75">Plain answers about MAIRO — what it does, what waits for you, and what costs money.</p>
        <div className="mt-8">
          <HelpSearch entries={helpIndex()} categories={HELP_CATEGORIES} basePath="/help" initialQuery={typeof q === "string" ? q : ""} />
        </div>
        <HelpContact signedIn={false} />
      </main>
      <SiteFooter toolsLive={toolsLive} />
    </div>
  );
}
