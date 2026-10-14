import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { campaignLimitText, creativeRequestText, planFor } from "@/lib/plans";
import { entitlementsFor } from "@/lib/entitlements";
import { PageHeader } from "@/components/ui";
import { HelpSearch } from "@/components/help/help-search";
import { HelpContact } from "@/components/help/help-article";
import { HELP_CATEGORIES, helpIndex } from "@/lib/help/articles";

// Help, inside the dashboard: the same articles as the public help center
// (lib/help/articles.ts), opened here so the sidebar stays put, plus what this
// business's own plan includes — read from the entitlements the server
// enforces, not restated.

export const metadata = { title: "Help — MAIRO" };

export default async function HelpCenterPage({ searchParams }: PageProps<"/dashboard/guide">) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const [org, ent, { q }] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true } }),
    entitlementsFor(organizationId),
    searchParams,
  ]);
  const plan = planFor(org?.subscriptionTier ?? "NONE");
  const hasPlan = ent.meta_ads;

  return (
    <div className="max-w-[960px]">
      <PageHeader title="Help" description="Plain answers about how MAIRO works — what it does, what waits for you, and what costs money." />

      <HelpSearch entries={helpIndex()} categories={HELP_CATEGORIES} basePath="/dashboard/guide" initialQuery={typeof q === "string" ? q : ""} />

      <section aria-labelledby="your-plan" className="mt-10 rounded-2xl border border-[color:var(--mairo-line)] bg-white/[0.03] p-5">
        <h2 id="your-plan" className="text-[13px] font-semibold text-white">
          Your plan
        </h2>
        {hasPlan ? (
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            <strong className="font-medium text-white">{plan.name}</strong>: {campaignLimitText(ent.campaign_limit)} at a time, {ent.studio_credits_monthly} AI image credits and {creativeRequestText(ent.creative_limit)}. Your ad spend is paid to Meta separately.
          </p>
        ) : (
          <p className="mt-2 text-[14px] leading-relaxed text-muted">No plan yet. Your free plan is yours to keep and change; a subscription is only needed to build and run campaigns.</p>
        )}
        <Link href="/dashboard/billing" className="mt-3 inline-flex text-[13.5px] text-violet-bright underline underline-offset-4 hover:text-white">
          {hasPlan ? "Billing and plan" : "See the plans"}
        </Link>
      </section>

      <HelpContact signedIn />
    </div>
  );
}
