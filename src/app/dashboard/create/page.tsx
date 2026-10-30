import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { entitlementsForTier } from "@/lib/entitlements";
import { planFor } from "@/lib/plans";
import { deleteCampaignDraftAction } from "@/lib/actions/campaign-wizard-actions";
import { WIZARD_STEPS } from "@/lib/campaigns/plan";
import { REPEAT_CHANGES } from "@/lib/campaigns/repeat";
import { goalLabel } from "@/lib/dashboard/campaigns";

// Create a campaign: how to start, in the owner's words.
//
//   Similar to my previous campaign   pick one, then say what to change
//   Promote something different       say what, and the wizard starts there
//   Start fresh                       the wizard from the beginning
//
// All three end in the same Create wizard (create/[service]) with its AI
// review and an explicit Launch — nothing here builds, launches or spends.
// The platform picker this replaced offered one working choice (Meta) beside
// three that weren't available; MAIRO runs Facebook and Instagram ads, so it
// says that in a line instead.

export const dynamic = "force-dynamic";

/** Longer than any build takes. */
const BUILD_STALE_MS = 15 * 60 * 1000;
function staleBuildCutoff(): Date {
  return new Date(Date.now() - BUILD_STALE_MS);
}

const choice =
  "mairo-glass flex min-h-[76px] w-full items-center gap-4 rounded-[22px] px-5 py-4 text-left transition-transform duration-200 hover:-translate-y-px";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ start?: string; about?: string; from?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { start, about, from } = await searchParams;

  // From the Overview's box: straight into the wizard with what they typed.
  if (start === "new" && typeof about === "string" && about.trim()) {
    redirect(`/dashboard/create/meta?about=${encodeURIComponent(about.trim().slice(0, 200))}`);
  }
  if (start === "fresh") redirect("/dashboard/create/meta");

  const [organization, connections, campaignCount, drafts, previous] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true },
    }),
    connectionSummaries(organizationId),
    db.mairoCampaign.count({
      where: { organizationId, status: { not: "ARCHIVED" } },
    }),
    db.campaignDraft.findMany({
      // One stuck mid-build (the server stopped before it could say how the
      // build went) drops off after a while; Campaigns shows what it made.
      // Meta drafts only: TikTok was retired, and a TikTok draft can't be finished.
      where: { organizationId, service: "meta", OR: [{ step: { not: "BUILDING" } }, { updatedAt: { gte: staleBuildCutoff() } }] },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, label: true, service: true, step: true, updatedAt: true },
    }),
    // Every campaign this business built, archived ones included: "the one I
    // ran in the summer" is exactly the one somebody wants again.
    db.mairoCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, objective: true, totalDailyBudgetCents: true, createdAt: true },
    }),
  ]);

  const tier = organization?.subscriptionTier ?? "NONE";
  const plan = planFor(tier);
  const limits = await entitlementsForTier(tier);
  const metaOn = connections.get("META")?.connected ?? false;
  const atLimit = Number.isFinite(limits.campaign_limit) && campaignCount >= limits.campaign_limit;
  const picked = from ? previous.find((p) => p.id === from) : null;
  const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  const header = (title: string, sub: string, back?: string) => (
    <header className="mb-6">
      {back && (
        <Link href={back} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-[13.5px] text-muted hover:text-white">
          <span aria-hidden>←</span> Back
        </Link>
      )}
      <h1 className="text-[clamp(26px,3.4vw,34px)] font-semibold tracking-[-0.025em] text-white">{title}</h1>
      <p className="mt-1.5 text-[14.5px] text-muted">{sub}</p>
    </header>
  );

  // ---- A previous campaign was picked: what should be different?
  if (picked) {
    return (
      <div className="mx-auto max-w-[680px]">
        {header("What would you like to change?", `Starting from “${picked.name}”. Everything else stays as it was — you'll see it all in the review before anything launches.`, "/dashboard/create?start=similar")}
        <ul className="space-y-2.5">
          {REPEAT_CHANGES.map((c) => (
            <li key={c.key}>
              <Link href={`/dashboard/create/meta?from=${picked.id}&step=${c.step}`} className={choice}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium text-white">{c.label}</span>
                  <span className="block text-[13px] text-muted">{c.hint}</span>
                </span>
                <span aria-hidden className="text-faint">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ---- "Similar to my previous campaign": which one?
  if (start === "similar") {
    return (
      <div className="mx-auto max-w-[680px]">
        {header("Which campaign should MAIRO start from?", "Its goal, audience, budget and destination are copied into a new campaign. The original isn't changed.", "/dashboard/create")}
        {previous.length === 0 ? (
          <p className="rounded-[22px] p-5 text-[14.5px] text-muted mairo-glass">
            You haven&rsquo;t made a campaign yet. <Link href="/dashboard/create/meta" className="text-white underline underline-offset-4">Start your first one</Link>.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {previous.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/create?from=${c.id}`} className={choice}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium text-white">{c.name}</span>
                    <span className="block text-[13px] text-muted">
                      {goalLabel(c.objective)} · {usd(c.totalDailyBudgetCents)} a day · {c.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </span>
                  <span aria-hidden className="text-faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px]">
      {header("Create a campaign", "MAIRO runs your Facebook and Instagram ads. It builds the campaign and writes the ad — you review everything and approve before anything goes live.")}

      {atLimit && (
        <p className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-[13.5px] text-amber-200">
          {plan.name} runs {limits.campaign_limit === 1 ? "one campaign" : `${limits.campaign_limit} campaigns`} at a time, and you have {campaignCount}. Pause or delete one, or{" "}
          <Link href="/dashboard/billing#plans" className="underline underline-offset-4">change your plan</Link>.
        </p>
      )}

      <div className="space-y-2.5">
        {previous.length > 0 && (
          <Link href="/dashboard/create?start=similar" className={choice}>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium text-white">Similar to my previous campaign</span>
              <span className="block text-[13px] text-muted">Run one again with a change or two</span>
            </span>
            <span aria-hidden className="text-faint">›</span>
          </Link>
        )}

        {/* What they want to promote, typed here, starts the wizard on it. */}
        <form action="/dashboard/create/meta" method="get" className="rounded-[22px] px-5 py-4 mairo-glass">
          <label htmlFor="about" className="block text-[16px] font-medium text-white">Promote something different</label>
          <span className="block text-[13px] text-muted">A product, a service, an offer — in a few words</span>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              id="about"
              name="about"
              required
              maxLength={200}
              placeholder="e.g. 20% off all hoodies this weekend"
              className="min-h-12 min-w-0 flex-1 rounded-full border bg-transparent px-4 text-[16px] text-white placeholder:text-faint focus:border-[color:var(--mairo-line-lit)] focus:outline-none"
              style={{ borderColor: "var(--mairo-line)" }}
            />
            <button type="submit" className="min-h-12 rounded-full bg-white px-6 text-[15px] font-semibold text-black">Continue</button>
          </div>
        </form>

        <Link href="/dashboard/create/meta" className={choice}>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-white">Start fresh</span>
            <span className="block text-[13px] text-muted">Answer a few questions: goal, what you&rsquo;re promoting, budget</span>
          </span>
          <span aria-hidden className="text-faint">›</span>
        </Link>
      </div>

      {!metaOn && (
        <p className="mt-5 text-[13.5px] text-muted">
          MAIRO can&rsquo;t reach your Meta ad account right now — it has to be connected before anything can launch.{" "}
          <Link href="/dashboard/meta" className="text-white underline underline-offset-4">Check the connection</Link>
        </p>
      )}

      {drafts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[15px] font-semibold text-white">Pick up where you left off</h2>
          <ul className="mt-3 divide-y overflow-hidden rounded-[22px] border" style={{ borderColor: "var(--mairo-line)" }}>
            {drafts.map((d) => {
              const building = d.step === "BUILDING";
              const step = WIZARD_STEPS.find((s) => s.id === d.step)?.label;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--mairo-line)" }}>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-white">{d.label}</p>
                    <p className="mt-0.5 text-[12px] text-faint">
                      {building ? "Being built now" : `Stopped at ${step ?? "the start"}`} · saved{" "}
                      {d.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {!building && (
                    <div className="flex items-center gap-2">
                      <form action={deleteCampaignDraftAction.bind(null, d.id)}>
                        <button type="submit" className="min-h-10 rounded-full px-3 text-[13px] text-muted transition hover:text-white">
                          Delete
                        </button>
                      </form>
                      <Link href={`/dashboard/create/${d.service}?draft=${d.id}`} className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-black">
                        Continue
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
