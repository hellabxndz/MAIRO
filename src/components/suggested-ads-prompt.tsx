import Link from "next/link";
import { db } from "@/lib/db";
import { suggestedAdsGate } from "@/lib/suggested-ads/store";

// The way in to "Review your suggested ads": shown once the business profile
// is confirmed, until the owner has approved one. Reads
// only this business's records.

export async function SuggestedAdsPrompt({ organizationId, className = "" }: { organizationId: string; className?: string }) {
  const gate = await suggestedAdsGate(organizationId).catch(() => null);
  if (!gate?.ready) return null;
  const approved = await db.creativeApproval.count({ where: { organizationId, revokedAt: null } });
  if (approved > 0) return null;
  return (
    <section aria-labelledby="suggested-ads-prompt" className={`rounded-[var(--radius-panel)] border border-violet/40 px-5 py-4 ${className}`} style={{ background: "radial-gradient(80% 120% at 0% 0%, rgba(124,92,255,0.14), transparent 70%)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="suggested-ads-prompt" className="text-[15px] font-semibold text-white">Review your suggested ads</h2>
          <p className="mt-0.5 text-[13px] text-muted">Three ways to start, written from what you confirmed about your business. One is marked as the best first test.</p>
        </div>
        <Link href="/dashboard/creatives/suggested" className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13px] font-medium text-white shadow-[var(--mairo-glow-key)]">
          See your suggested ads
        </Link>
      </div>
    </section>
  );
}
