import Link from "next/link";
import { PLANS, PRO_TRIAL_DAYS } from "@/lib/plans";

// "Your strategy is ready. Let MAIRO put it to work." — the step from a free
// plan to a subscription, with the one thing people most often get wrong said
// plainly: the subscription pays for MAIRO; the ads are paid to Meta, from the
// owner's own ad account.

export function ConversionBlock() {
  const starter = PLANS[0];
  return (
    <section aria-labelledby="convert-title" className="relative mx-auto max-w-[1280px] px-4 py-16 sm:px-8 sm:py-24 lg:px-12">
      <div data-reveal className="relative overflow-hidden rounded-[32px] border px-6 py-14 sm:px-12 sm:py-16" style={{ borderColor: "rgba(47,107,255,0.32)", background: "radial-gradient(80% 120% at 100% 0%, rgba(47,107,255,0.26), transparent 60%), radial-gradient(60% 90% at 0% 100%, rgba(56,189,248,0.08), transparent 60%), #0a0f1f" }}>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <h2 id="convert-title" className="text-[clamp(30px,4.2vw,54px)] font-semibold leading-[1.02] tracking-[-0.04em] text-white [text-wrap:balance]">
              Your strategy is ready. Let MAIRO put it to work.
            </h2>
            <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-white/70">Go from recommendations to advertising campaigns with your AI team managing the workflow.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/sign-up?from=home" className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-7 text-[16px] font-semibold text-white shadow-[0_18px_44px_-16px_rgba(47,107,255,0.85)] transition hover:brightness-110">
                Activate Your AI Advertising Team <span aria-hidden>→</span>
              </Link>
              <Link href="#pricing" className="inline-flex min-h-[54px] items-center justify-center rounded-full border border-white/15 px-7 text-[15.5px] font-semibold text-white transition hover:border-white/40">
                Explore Plans
              </Link>
            </div>
          </div>
          <dl className="grid gap-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Your MAIRO subscription</dt>
              <dd className="mt-1.5 text-[14.5px] leading-relaxed text-white/80">
                From ${starter.priceMonthly} a month — {PRO_TRIAL_DAYS}-day free trial on {starter.name}. It pays for your AI team: planning, building, daily checks, recommendations and reports.
              </dd>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Your ad spend</dt>
              <dd className="mt-1.5 text-[14.5px] leading-relaxed text-white/80">Separate, and yours to set. Meta charges it to your own ad account — MAIRO never holds or spends your money.</dd>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Your approval</dt>
              <dd className="mt-1.5 text-[14.5px] leading-relaxed text-white/80">Every launch and every increase to your total budget waits for you.</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
