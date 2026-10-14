import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { PreviewFlow } from "@/components/preview/preview-flow";
import { brandFont } from "@/lib/fonts";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { businessTypeFrom } from "@/lib/onboarding/business-types";
import { ONBOARDING_TYPE, PREVIEW_EXAMPLE } from "@/lib/demo/examples";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { AmbientSky } from "@/components/ambient-sky";

// "Build My Free Ad Plan": a description of the business (?name=,
// ?describe=), an Instagram username (?instagram=) or a website address
// (?website=), with the objective, industry and monthly budget if the
// visitor gave them (?goal=, ?type=, ?budget=) — or ?example= for one of the
// sample businesses. The reading itself happens in the browser via
// /api/tools/scan or /api/tools/instagram, so this page stays fast and every
// progress line is real.
// The URL is still /preview, so every existing link keeps working.

export const metadata: Metadata = {
  title: "Build your free ad plan — MAIRO",
  description: "Tell MAIRO about your business, share your Instagram, or add your website. It identifies advertising opportunities and builds a personalized Facebook and Instagram ad plan around your goals — free to explore.",
  alternates: { canonical: "/preview" },
};

export default async function PreviewPage({ searchParams }: PageProps<"/preview">) {
  const { website, example, type, manual, describe, goal, budget, name, instagram, start } = await searchParams;
  const raw = typeof website === "string" && (start === undefined || start === "website") ? website.slice(0, 300) : "";
  const initialWebsite = raw ? normalizeUrl(raw) : null;
  // The story's multi-brand team opens its brand's example, the salon.
  const initialExample = example === "shop" || example === "service" || example === "appointments" || example === "brands" ? PREVIEW_EXAMPLE[example] : null;
  // ?type= is either an onboarding business type or one of the story's example kinds (the team example implies no type).
  const t = typeof type === "string" ? type : null;
  const initialType = businessTypeFrom(t)?.id ?? (t === "shop" || t === "service" || t === "appointments" || t === "brands" ? ONBOARDING_TYPE[t] : null);
  const initialDescribe = typeof describe === "string" && describe.trim() ? describe.trim().slice(0, 400) : null;
  const initialName = typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : null;
  // A form sent before JavaScript ran carries every field; only the chosen route's counts.
  const route = start === "describe" || start === "instagram" || start === "website" ? start : null;
  const initialInstagram = typeof instagram === "string" && instagram.trim() && (!route || route === "instagram") ? instagram.trim().slice(0, 120) : null;
  const initialGoal = goal === "sales" || goal === "leads" || goal === "bookings" ? goal : "";
  const b = typeof budget === "string" ? Number(budget.replace(/[^0-9.]/g, "")) : NaN;
  const initialBudget = Number.isFinite(b) && b > 0 && b <= 1_000_000 ? Math.round(b) : null;
  return (
    <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-hidden bg-paper text-white`}>
      <AmbientSky />
      <LandingNav toolsLive={USABLE_TOOLS().length > 0} />
      <main className="px-4 pb-20 pt-[104px] sm:px-8 sm:pt-[124px]">
        <PreviewFlow
          key={`${initialWebsite ?? ""}|${initialExample ?? ""}|${manual ?? ""}|${initialDescribe ?? ""}|${initialName ?? ""}|${initialInstagram ?? ""}`}
          initialWebsite={initialWebsite}
          initialExample={initialExample}
          initialType={initialType}
          initialManual={manual === "1" && !initialWebsite && !initialExample}
          initialDescribe={initialWebsite || initialExample || initialInstagram ? null : initialDescribe}
          initialName={initialWebsite || initialExample || initialInstagram ? null : initialName}
          initialInstagram={initialWebsite || initialExample ? null : initialInstagram}
          initialGoal={initialGoal}
          initialBudget={initialBudget}
        />
      </main>
      <SiteFooter toolsLive={USABLE_TOOLS().length > 0} />
    </div>
  );
}
