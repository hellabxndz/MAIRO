import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentMember } from "@/lib/members/authorize";
import { can } from "@/lib/members/roles";
import { DEFAULT_ENTITLEMENTS, entitlementsFor } from "@/lib/entitlements";
import { hasActivePlan } from "@/lib/readiness";
import { planFor } from "@/lib/plans";
import { brandsOf, payingBusinessOf } from "@/lib/brands";
import { secondaryButtonClass } from "@/components/ui";
import { openBusinessAction } from "@/lib/actions/brand-actions";
import { AddBusinessForm, RemoveBusinessForm } from "./business-forms";

// Settings › Your businesses: the Meta ad accounts one subscription covers.
//
// MAIRO Scale covers up to three — this business and up to two more, each
// with its own Meta ad account, campaigns, ads and results. MAIRO Pro covers
// one. See lib/brands.ts for how the extra businesses follow the plan.

export const metadata = { title: "Your businesses" };

export default async function BusinessesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const me = await currentMember();
  if (!me) redirect("/dashboard");

  const back = (
    <Link href="/dashboard/settings" className="text-[13px] text-muted hover:text-white">
      ← Settings
    </Link>
  );
  const scale = planFor("SCALE_V2");

  if (me.actingAsClient) {
    return (
      <div className="mx-auto max-w-[760px]">
        {back}
        <h1 className="mt-3 text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">Your businesses</h1>
        <p className="mt-2 text-[14.5px] text-muted">You run this business from your freelancer workspace; its clients are listed there.</p>
      </div>
    );
  }

  const payer = await payingBusinessOf(me.organizationId);
  const homeId = payer?.id ?? me.organizationId;
  const [home, brands, memberships] = await Promise.all([
    db.organization.findUnique({
      where: { id: homeId },
      select: { id: true, name: true, kind: true, subscriptionTier: true, subscriptionStatus: true, metaAdAccount: { select: { id: true } } },
    }),
    brandsOf(homeId),
    db.organizationMember.findMany({ where: { userId: me.userId }, select: { organizationId: true } }),
  ]);
  if (!home || home.kind !== "BUSINESS") redirect("/dashboard/settings");

  const ent = await entitlementsFor(homeId);
  const live = home.subscriptionTier !== "NONE" && hasActivePlan({ ...home, paymentRequired: true });
  const limit = live ? ent.ad_account_limit : 1;
  const mine = new Set(memberships.map((m) => m.organizationId));
  const manages = !payer && can(me.role, "billing.manage");
  const rows = [{ ...home, paying: true }, ...brands.map((b) => ({ ...b, paying: false }))];

  return (
    <div className="mx-auto max-w-[860px]">
      {back}
      <h1 className="mt-3 text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">Your businesses</h1>
      <p className="mt-1 mb-6 max-w-[640px] text-[14.5px] leading-relaxed text-muted">
        Each business has its own Meta ad account, campaigns, ads and results. {scale.name} covers up to {DEFAULT_LIMIT} — {home.name} and up to {DEFAULT_LIMIT - 1} more. {planFor("PRO").name} covers one.
      </p>

      <ul className="space-y-3">
        {rows.map((r, i) => {
          const covered = i < limit;
          return (
            <li key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-white">{r.name}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {r.paying ? "Pays for the plan" : "Covered by " + home.name + "'s plan"} · {r.metaAdAccount ? "Meta ad account connected" : "Meta ad account not connected yet"}
                  </p>
                  {!covered && (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-amber-200">
                      Not covered by the current plan: MAIRO can&rsquo;t build, change or launch anything here. Running campaigns keep running until you pause them, and pausing still works.
                    </p>
                  )}
                </div>
                {r.id === me.organizationId ? (
                  <span className="rounded-full border border-white/15 px-3 py-1 text-[11.5px] text-muted">You&rsquo;re here</span>
                ) : mine.has(r.id) ? (
                  <form action={openBusinessAction}>
                    <input type="hidden" name="organizationId" value={r.id} />
                    <button type="submit" className={secondaryButtonClass}>Open</button>
                  </form>
                ) : (
                  <span className="text-[12px] text-faint">You&rsquo;re not on its team</span>
                )}
              </div>
              {manages && !r.paying && <RemoveBusinessForm id={r.id} name={r.name} />}
            </li>
          );
        })}
      </ul>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-[15px] font-semibold text-white">Add a business</h2>
        {payer ? (
          <p className="mt-2 text-[13.5px] text-muted">Businesses are added from {payer.name}, which pays for the plan.</p>
        ) : !live || limit <= 1 ? (
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            More than one Meta ad account is part of {scale.name}: up to {DEFAULT_LIMIT} businesses or brands under one subscription.{" "}
            {manages && <Link href={live ? "/dashboard/billing/change?to=SCALE_V2" : "/dashboard/billing"} className="text-blue-bright hover:text-white">See {scale.name}</Link>}
          </p>
        ) : rows.length >= limit ? (
          <p className="mt-2 text-[13.5px] text-muted">All {limit} Meta ad accounts on your plan are in use.</p>
        ) : !manages ? (
          <p className="mt-2 text-[13.5px] text-muted">Only an owner can add a business, because it changes what the plan covers.</p>
        ) : (
          <>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {limit - rows.length} of {limit} left. You&rsquo;ll set it up next and connect its own Meta ad account; MAIRO asks before connecting anything. Your team isn&rsquo;t added automatically — invite whoever should work on it from its Team page.
            </p>
            <AddBusinessForm />
          </>
        )}
      </section>
      <p className="mt-4 text-[12px] text-faint">Ad spend is separate for every business: Meta charges each one&rsquo;s own ad account directly.</p>
    </div>
  );
}

/** What MAIRO Scale covers, from the plan itself. */
const DEFAULT_LIMIT = DEFAULT_ENTITLEMENTS.SCALE_V2.ad_account_limit;
