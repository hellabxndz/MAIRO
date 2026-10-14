import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { PreviewFlow } from "@/components/preview/preview-flow";
import { PlanGenerator } from "@/components/plan-generator/plan-generator";
import { brandFont } from "@/lib/fonts";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { businessTypeFrom } from "@/lib/onboarding/business-types";
import { ONBOARDING_TYPE, PREVIEW_EXAMPLE } from "@/lib/demo/examples";
import { USABLE_TOOLS } from "@/lib/tools/registry";
import { AmbientSky } from "@/components/ambient-sky";

// The free AI ad plan. By default, the Free AI Meta Ad Strategy Generator:
// the website, what the business sells, the goal and the monthly Meta budget
// (?website=, ?sells=, ?name=, ?goal=, ?budget=), and ?generate=1 when the
// homepage's hero sent the visitor here to make the plan straight away. The
// reading and the writing happen through /api/tools/scan and
// /api/tools/ad-plan, so this page stays fast and every stage is real.
//
// The earlier free-plan flow is kept for the links that use it: the example
// plans (?example=), an Instagram username (?instagram=) and a description
// (?describe=, ?manual=1).
// The URL is still /preview, so every existing link keeps working.

export const metadata: Metadata = {
  title: "Free AI Meta ad strategy generator",
  description: "Tell MAIRO what your business sells, choose your goal and monthly ad budget, and see how your AI advertising team would grow your business — a free, personalized Facebook and Instagram ad plan. No card, no ads launched.",
  alternates: { canonical: "/preview" },
};

const GOALS = ["sales", "leads", "bookings", "traffic", "awareness"] as const;

export default async function PreviewPage({ searchParams }: PageProps<"/preview">) {
  const { website, example, type, manual, describe, goal, budget, name, instagram, start, generate, sells } = await searchParams;
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
  const legacy = generate !== "1" && Boolean(initialExample || initialInstagram || initialDescribe || manual === "1" || route === "describe" || route === "instagram");

  if (!legacy) {
    const g = typeof goal === "string" && (GOALS as readonly string[]).includes(goal) ? (goal as (typeof GOALS)[number]) : "";
    return (
      <div className={`${brandFont.className} relative isolate min-h-screen overflow-x-hidden bg-paper text-white`}>
        <AmbientSky />
        <LandingNav toolsLive={USABLE_TOOLS().length > 0} />
        <main className="px-4 pb-20 pt-[104px] sm:px-8 sm:pt-[124px]">
          <PlanGenerator
            mode="page"
            initial={{
              website: typeof website === "string" ? website.slice(0, 300) : null,
              sells: typeof sells === "string" ? sells.slice(0, 400) : "",
              name: typeof name === "string" ? name.slice(0, 80) : "",
              goal: g,
              budget: initialBudget,
              autostart: generate === "1",
            }}
          />
        </main>
        <SiteFooter toolsLive={USABLE_TOOLS().length > 0} />
      </div>
    );
  }

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
