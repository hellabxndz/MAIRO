import Link from "next/link";
import type { Readiness } from "@/lib/readiness";
import { GlassPanel, MairoButton } from "@/components/mairo";

// The steps to a first campaign, for Simple view.
//
// Advanced view has always shown these as a checklist; Simple view hid them,
// which left a new customer with a "Create new campaign" button and no idea
// that nothing could run until their ad account was connected. This is the
// same list — the same readiness rows, so the two views can't disagree — with
// the one next step made obvious and everything else quiet.
//
// Planning is never blocked: the monthly plan and a campaign draft can be made
// before anything is connected. Only making the campaign waits.

const ACTION_LABEL: Partial<Record<string, string>> = {
  plan: "Choose a plan",
  business: "Tell MAIRO about your business",
  ad_account: "Connect Facebook & Instagram",
  funding: "Add a card in Meta",
  creative: "Make your first ad",
};

export function FirstSteps({
  readiness,
  monthlyPlan,
  monthLabel,
}: {
  readiness: Readiness;
  monthlyPlan: { summary: string } | null;
  monthLabel: string;
}) {
  if (readiness.ready) return null;
  const next = readiness.next;
  // Connecting comes back to the dashboard rather than the Meta page.
  const hrefFor = (id: string, href: string) =>
    id === "ad_account" ? `/api/meta/connect?returnTo=${encodeURIComponent("/dashboard")}` : href;

  return (
    <div data-tour="checklist">
    <GlassPanel lit className="p-6 sm:p-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Your first campaign</p>
      <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-white">
        {readiness.remaining === 1 ? "One step left before your ads can run" : `${readiness.remaining} steps before your ads can run`}
      </h2>

      <ol className="mt-5 space-y-3">
        {readiness.steps.map((step, i) => {
          const isNext = step.id === next?.id;
          return (
            <li key={step.id} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px]"
                style={{
                  borderColor: step.done ? "rgba(52,211,153,0.4)" : isNext ? "rgba(108,158,255,0.6)" : "var(--mairo-line)",
                  background: step.done ? "rgba(52,211,153,0.1)" : isNext ? "rgba(61,125,255,0.15)" : "transparent",
                  color: step.done ? "#6ee7b7" : isNext ? "white" : undefined,
                }}
                aria-hidden
              >
                {step.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[14px] ${step.done ? "text-faint line-through decoration-white/20" : isNext ? "text-white" : "text-muted"}`}>
                  {step.label}
                  {step.owner === "mairo" && !step.done && <span className="ml-2 text-[11px] text-faint">MAIRO does this</span>}
                </p>
                {isNext && (
                  <>
                    <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
                      {step.unknown ? "MAIRO couldn't check this with Meta just now — it will try again." : step.detail}
                    </p>
                    {step.owner === "you" &&
                      (step.id === "ad_account" ? (
                        // A plain link, not a prefetching one: loading this
                        // address starts Meta's sign-in.
                        <a
                          href={hrefFor(step.id, step.href)}
                          className="mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-white transition hover:brightness-110"
                          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
                        >
                          {ACTION_LABEL[step.id]} →
                        </a>
                      ) : (
                        <MairoButton href={step.href} className="mt-3">
                          {ACTION_LABEL[step.id] ?? step.label} →
                        </MairoButton>
                      ))}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}>
        <p className="text-[13px] text-white">You can plan now</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Your monthly plan and your campaigns can be worked out before anything is connected. MAIRO only makes a campaign
          once your ad account is connected — nothing is spent before then.
        </p>
        {monthlyPlan ? (
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/85">
            <span className="text-faint">{monthLabel} plan: </span>
            {monthlyPlan.summary.length > 180 ? `${monthlyPlan.summary.slice(0, 180).trim()}…` : monthlyPlan.summary}{" "}
            <Link href="/dashboard/plan" className="text-muted underline underline-offset-4 hover:text-white">
              See the full plan
            </Link>
          </p>
        ) : (
          <Link href="/dashboard/plan" className="mt-3 inline-block text-[12.5px] text-muted underline underline-offset-4 hover:text-white">
            See your monthly plan
          </Link>
        )}
      </div>
    </GlassPanel>
    </div>
  );
}
