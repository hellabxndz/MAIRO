import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { PreviewFlow } from "@/components/preview/preview-flow";
import { brandFont } from "@/lib/fonts";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { businessTypeFrom } from "@/lib/onboarding/business-types";
import { ONBOARDING_TYPE } from "@/lib/demo/examples";
import { USABLE_TOOLS } from "@/lib/tools/registry";

// The landing page's "Preview my campaign": a website address (or nothing —
// the visitor can describe the business instead), or ?example= for one of the
// story's sample businesses. The reading itself happens in the browser via
// /api/tools/scan, so this page stays fast and every progress line is real.

export const metadata: Metadata = {
  title: "Preview your campaign — free",
  description: "Give MAIRO your website. See what it finds, correct anything that's wrong, and get a first draft of a Facebook and Instagram campaign built around your business.",
  alternates: { canonical: "/preview" },
};

export default async function PreviewPage({ searchParams }: PageProps<"/preview">) {
  const { website, example, type, manual } = await searchParams;
  const raw = typeof website === "string" ? website.slice(0, 300) : "";
  const initialWebsite = raw ? normalizeUrl(raw) : null;
  const initialExample = example === "shop" || example === "service" || example === "appointments" ? example : null;
  // ?type= is either an onboarding business type or one of the story's example kinds.
  const t = typeof type === "string" ? type : null;
  const initialType = businessTypeFrom(t)?.id ?? (t === "shop" || t === "service" || t === "appointments" ? ONBOARDING_TYPE[t] : null);
  return (
    <div className={`${brandFont.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav toolsLive={USABLE_TOOLS().length > 0} />
      <main className="px-4 pb-20 pt-[104px] sm:px-8 sm:pt-[124px]">
        <PreviewFlow key={`${initialWebsite ?? ""}|${initialExample ?? ""}|${manual ?? ""}`} initialWebsite={initialWebsite} initialExample={initialExample} initialType={initialType} initialManual={manual === "1" && !initialWebsite && !initialExample} />
      </main>
      <SiteFooter toolsLive={USABLE_TOOLS().length > 0} />
    </div>
  );
}
