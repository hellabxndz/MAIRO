import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { calendarStatus, promotionLabel, PROMOTION_KEYS, type PromotionKind } from "@/lib/social/goals";
import { localDate } from "@/lib/social/manager";
import { socialGate } from "../gate";
import { SocialTabs } from "../social-tabs";
import { EndPromotion, PromotionForm } from "./promotion-form";

// Promotions (Scale only): a sale, a launch, an event. MAIRO sequences the
// posts — teaser, launch, showcase, reminder, ending soon, last chance —
// and mixes them with useful posts so the feed doesn't read like ads.

export const maxDuration = 60;

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const gate = await socialGate(organizationId);
  if (gate) return gate;

  const sp = await searchParams;
  const initialKind = (PROMOTION_KEYS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as PromotionKind) : null;
  const [strategy, promotions, org] = await Promise.all([
    db.socialStrategy.findUnique({ where: { organizationId }, select: { id: true } }),
    db.socialPromotion.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { posts: { orderBy: { scheduledFor: "asc" }, select: { id: true, sequenceStep: true, status: true, scheduledFor: true, network: true } } },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  const zone = org?.timezone || "America/New_York";
  const fmt = (d: Date | null) => (d ? new Date(`${localDate(d, zone)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

  return (
    <div>
      <PageHeader title="Promotions" description="Tell MAIRO what's happening at your business. It plans the right posts at the right moments." />
      <SocialTabs active="/dashboard/social/promotions" />

      {!strategy ? (
        <p className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-[14px] text-muted">
          First, <Link href="/dashboard/social" className="text-violet-bright underline underline-offset-4">tell MAIRO your goal</Link>. Promotions are planned inside your strategy.
        </p>
      ) : (
        <PromotionForm initialKind={initialKind} />
      )}

      {promotions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[16px] font-semibold text-white">Your promotions</h2>
          <ul className="space-y-3">
            {promotions.map((p) => (
              <li key={p.id} className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{promotionLabel(p.kind)}</p>
                    <p className="mt-0.5 text-[15px] font-semibold text-white">{p.title}</p>
                    <p className="text-[12.5px] text-muted">
                      {p.startsAt ? fmt(p.startsAt) : ""}{p.endsAt ? ` – ${fmt(p.endsAt)}` : ""} · {p.status === "ACTIVE" ? "Running" : p.status === "CANCELLED" ? "Stopped" : "Ended"}
                    </p>
                  </div>
                  {p.status === "ACTIVE" && <EndPromotion id={p.id} />}
                </div>
                {p.posts.length > 0 ? (
                  <ol className="mt-3 flex flex-wrap gap-1.5">
                    {p.posts.map((post) => {
                      const s = calendarStatus(post);
                      return (
                        <li key={post.id} className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-white/80">
                          {post.sequenceStep ?? "Post"} · {fmt(post.scheduledFor)} · <span className="text-faint">{s.label}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-2 text-[12.5px] text-faint">Posts are added to your calendar as their dates come into the planning window.</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-faint">See and approve each post in the <Link href="/dashboard/social/calendar" className="underline underline-offset-4">Content Calendar</Link>.</p>
        </section>
      )}
    </div>
  );
}
