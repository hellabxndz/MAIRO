import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { executionBlock } from "@/lib/billing/execution";
import { openAiImageConfigured } from "@/lib/ai/openai-image";
import { storageConfigured } from "@/lib/storage/blob";
import { ensureDirections, listSuggestions, suggestedAdsGate } from "@/lib/suggested-ads/store";
import { currentExperiment } from "@/lib/experiments/store";
import { renderingAvailable } from "@/lib/suggested-ads/render-run";
import { rewriteAvailable } from "@/lib/ai/rewrite-words";
import { SuggestedAds } from "./suggested-ads";

// "Review your suggested ads" — the first thing to do once Meta is connected
// and the business profile is confirmed. Three directions written from what
// the owner confirmed, one recommended as the first test; each can become a
// real picture (after its cost is shown), be rewritten, or use the owner's own
// video. Approval is bound to the exact words and media version.

export const metadata: Metadata = { title: "Review your suggested ads" };
// Making a picture, or rendering a video edit, runs inside a server action on this page.
export const maxDuration = 300;

export default async function SuggestedAdsPage() {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const gate = await suggestedAdsGate(organizationId);

  if (!gate.ready) {
    return (
      <div className="mx-auto max-w-[720px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white sm:text-[26px]">Review your suggested ads</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">MAIRO suggests your first ads from what you&apos;ve confirmed about your business, once your Meta ad account is connected. Two things first:</p>
        <ol className="mt-6 space-y-3">
          <Step done={gate.profileConfirmed} label="Confirm what you sell in your Business Brain" href="/dashboard/settings/business-brain" />
          <Step done={gate.metaConnected} label="Connect your Meta ad account" href="/dashboard/meta" />
        </ol>
        {gate.next && (
          <Link href={gate.next.href} className="mt-6 inline-flex min-h-[40px] items-center rounded-full bg-[image:var(--mairo-ramp)] px-5 text-[14px] font-medium text-white shadow-[var(--mairo-glow-key)]">
            {gate.next.label}
          </Link>
        )}
      </div>
    );
  }

  await ensureDirections(organizationId, session.user.id);
  const [data, test, blocked, rendering] = await Promise.all([listSuggestions(organizationId), currentExperiment(organizationId), executionBlock(organizationId), renderingAvailable()]);

  return (
    <SuggestedAds
      organizationId={organizationId}
      data={JSON.parse(JSON.stringify(data))}
      test={test}
      paid={!blocked}
      imagesAvailable={openAiImageConfigured() && storageConfigured()}
      uploadsAvailable={storageConfigured()}
      rewriteAvailable={rewriteAvailable()}
      rendering={rendering}
    />
  );
}

function Step({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--mairo-line)" }}>
      <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] ${done ? "bg-live/20 text-live" : "bg-white/[0.06] text-muted"}`}>{done ? "✓" : "·"}</span>
      <span className="flex-1 text-[14px] text-white">{label}</span>
      <span className="text-[12.5px] text-muted">{done ? "Done" : <Link href={href} className="underline underline-offset-4 hover:text-white">Do this</Link>}</span>
    </li>
  );
}
