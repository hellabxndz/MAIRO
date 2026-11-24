import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { hasActivePlan } from "@/lib/readiness";
import { AnalyzerView, type ActionLinks } from "@/components/analyzer/analyzer-view";

// The Meta Ads Analyzer (components/analyzer/analyzer-view.tsx, lib/analyzer).
// Free on every plan: connecting Meta shows its value before anyone pays.
// Each action goes where this business can actually do it — a business
// without a plan is sent to choose one, never to a locked screen.

export const metadata = { title: "Your ads, analyzed" };
export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const [org, meta, plan] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, metaAdAccountId: true } }),
    db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true } }),
  ]);
  if (!meta || meta.status !== "CONNECTED") redirect("/dashboard/meta?next=analysis");
  const paid = org ? hasActivePlan(org) : false;
  const choose = { href: plan?.status === "APPROVED" ? "/plan/activate" : "/preview", label: "See plans to let MAIRO do it" };
  const actions: ActionLinks = paid
    ? {
        build: { href: plan ? "/dashboard/launch" : "/dashboard/create", label: "Build my improved campaign" },
        fix: { href: plan ? "/dashboard/launch" : "/dashboard/create", label: "Build a better replacement" },
        creatives: { href: "/dashboard/creative-studio", label: "Improve my ad creatives" },
        budget: { href: "/dashboard/decisions", label: "Optimize my budget" },
        tracking: { href: "/dashboard/pixel", label: "Improve my tracking" },
      }
    : { build: choose, fix: choose, creatives: choose, budget: choose, tracking: { href: "/dashboard/pixel", label: "Improve my tracking" } };
  const act = meta.metaAdAccountId.replace(/^act_/, "");
  return (
    <div className="px-1 pb-16 pt-2">
      <AnalyzerView actions={actions} adsManager={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(act)}`} />
    </div>
  );
}
