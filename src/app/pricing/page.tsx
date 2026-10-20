import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { FaqBlock, PricingBlock } from "@/components/landing/home";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { brandFont } from "@/lib/fonts";
import { PLANS } from "@/lib/plans";

// The pricing page: the same block the homepage ends with, on its own, so a
// link to "pricing" lands on the two plans rather than half way down a page.

export const metadata: Metadata = {
  title: "Pricing",
  description: `${PLANS.map((p) => `${p.name} $${p.priceMonthly}/month`).join(" or ")}. Start with a free AI advertising plan; ad spend is paid to Meta separately.`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-clip bg-paper text-white`}>
      <LandingNav toolsLive={toolsLive} />
      <main className="pt-6">
        <PricingBlock cta={{ href: "/preview", label: "Build My Free AI Ad Plan" }} />
        <FaqBlock />
      </main>
      <SiteFooter toolsLive={toolsLive} />
    </div>
  );
}
