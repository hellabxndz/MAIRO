import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { deniedFor } from "@/lib/members/authorize";
import { plansFor } from "@/lib/preview/saved-plan-store";
import { buildReport } from "@/lib/preview/report";
import { budgetLabel, setupGoalFor } from "@/lib/preview/strategy";
import type { PreviewGoal } from "@/lib/preview/build";
import { loadStrategy, planHeadline } from "@/lib/strategy/store";
import { usd } from "@/lib/strategy/plan-logic";
import { destinationsForStart, suggestedDestination } from "@/lib/onboarding/quick-start";
import { JourneyFrame } from "@/components/strategy/journey";
import { ApproveForm, ConfirmSetupForm, WriteStrategyForm } from "./start-forms";

// "I like it — get started": where a free plan the owner liked becomes their
// MAIRO setup, in the order they asked for — account (done by now), confirm
// and approve, choose a MAIRO plan, connect Meta. The free plan already has
// the website, what they sell, the goal and the budget, so this asks one
// question, MAIRO writes the strategy from it, and the owner approves what
// they're shown. Nothing here launches a campaign or spends money: the first
// campaign is built switched off and waits for their authorization.

export const metadata = { title: "Get started" };
export const dynamic = "force-dynamic";
// Writing the strategy is a model call.
export const maxDuration = 60;

const STEPS = ["Create your account", "Confirm your strategy", "Choose your MAIRO plan", "Connect your Meta ad account"];

function Steps({ at }: { at: number }) {
  return (
    <ol aria-label="Getting started" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? "step" : undefined} className={`rounded-xl border px-3 py-2.5 text-[12.5px] leading-snug ${i < at ? "border-emerald-400/25 bg-emerald-400/[0.05] text-emerald-200" : i === at ? "border-violet-400/50 bg-violet-500/[0.10] text-white" : "border-white/10 text-white/45"}`}>
          <span className="mr-1.5 font-semibold">{i < at ? "✓" : `${i + 1}.`}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

const card = "rounded-[24px] border border-white/10 bg-white/[0.025] p-6 sm:p-8";

export default async function StartPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in?callbackUrl=/plan/start");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  if (await deniedFor("business.edit")) redirect("/dashboard");

  const [org, intake, loaded, saved] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, parentId: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    loadStrategy(organizationId),
    plansFor(organizationId),
  ]);
  if (!org) redirect("/sign-in");
  // A business added under another's plan is already paid for: its own setup path.
  if (org.parentId) redirect(intake ? "/dashboard" : "/onboarding?full=1");

  // Already approved: on to choosing a plan (or, once paid, the first campaign).
  if (loaded?.row.activatedAt) redirect("/dashboard/launch?welcome=1");
  if (loaded?.row.status === "APPROVED") redirect("/plan/activate?skip=1#plans");

  // Step 2b: the strategy MAIRO wrote, for the owner to approve.
  if (intake && loaded) {
    const p = loaded.plan;
    const h = planHeadline(p);
    const facts: [string, string][] = [
      ["Goal", h.goal],
      ["Where your ads run", h.platform],
      ["Ad budget", `${h.budget} — about ${usd(p.dailyBudget * 30)} a month, paid to Meta`],
      ["Campaign", h.campaign],
      ["Who it reaches", [p.audience.location, `ages ${p.audience.ageMin}–${p.audience.ageMax}`, p.audience.interests.length ? `interested in ${p.audience.interests.slice(0, 3).join(", ")}` : ""].filter(Boolean).join(" · ")],
    ];
    return (
      <JourneyFrame steps={null}>
        <div className="mx-auto max-w-[860px] space-y-6 py-4">
          <Steps at={1} />
          <section aria-labelledby="strategy-title" className={card}>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-200">Your strategy is ready</p>
            <h1 id="strategy-title" className="mt-2 text-[clamp(24px,3.4vw,32px)] font-semibold leading-tight tracking-[-0.02em] text-white">Approve your strategy for {org.name}</h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-white/65">Written from your free plan. Check it, then approve it to choose your MAIRO plan.</p>
            <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11.5px] uppercase tracking-[0.14em] text-white/45">{k}</dt>
                  <dd className="mt-1 text-[14.5px] text-white">{v}</dd>
                </div>
              ))}
            </dl>
            {p.summary && <p className="mt-6 border-t border-white/10 pt-5 text-[14px] leading-relaxed text-white/75">{p.summary}</p>}
            {p.concepts.length > 0 && (
              <div className="mt-5">
                <p className="text-[11.5px] uppercase tracking-[0.14em] text-white/45">First ad ideas</p>
                <ul className="mt-2 space-y-1.5 text-[14px] text-white/85">
                  {p.concepts.slice(0, 3).map((c) => (
                    <li key={c.title} className="flex gap-2"><span aria-hidden className="text-violet-300">✦</span>{c.title}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ApproveForm version={loaded.row.version} />
              <Link href="/plan" className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-white/20 px-6 text-[14.5px] font-semibold text-white transition hover:border-white/45">
                Change something first
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-white/50">
              Approving doesn&rsquo;t launch anything or spend money. After you choose a plan and connect your Meta ad account, MAIRO builds your first campaign switched off, and you review and authorize it before it goes live.
            </p>
          </section>
        </div>
      </JourneyFrame>
    );
  }

  // Set up, but the strategy wasn't written (the AI didn't answer in time).
  if (intake) {
    return (
      <JourneyFrame steps={null}>
        <div className="mx-auto max-w-[860px] space-y-6 py-4">
          <Steps at={1} />
          <section className={card}>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">Your setup is saved</h1>
            <p className="mt-2 text-[14.5px] text-white/65">MAIRO didn&rsquo;t finish writing your strategy. Try again — your answers are kept.</p>
            <WriteStrategyForm />
          </section>
        </div>
      </JourneyFrame>
    );
  }

  // Step 2a: the setup, from the free plan, with the one question it can't answer.
  const plan = saved[0]?.plan;
  if (!plan) redirect("/onboarding?full=1");
  const report = buildReport(plan);
  const goal = setupGoalFor(plan.inputs.goal as PreviewGoal);
  const known: [string, string][] = [
    ["Business", org.name],
    ["What you offer", plan.facts.offering || plan.inputs.sells],
    ["Website", plan.inputs.website ? plan.inputs.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : "No website"],
    ["Goal", report?.goalLabel ?? plan.inputs.goal],
    ["Monthly ad budget", `${budgetLabel(plan.inputs.monthly)} a month, paid to Meta from your own ad account`],
    ...(plan.facts.location ? ([["Where", plan.facts.location]] as [string, string][]) : []),
  ];
  return (
    <JourneyFrame steps={null}>
      <div className="mx-auto max-w-[860px] space-y-6 py-4">
        <Steps at={1} />
        <section aria-labelledby="confirm-title" className={card}>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Account created ✓</p>
          <h1 id="confirm-title" className="mt-2 text-[clamp(24px,3.4vw,32px)] font-semibold leading-tight tracking-[-0.02em] text-white">Confirm your setup</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-white/65">From the free plan you liked. One question, then MAIRO writes your strategy for you to approve.</p>
          <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {known.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11.5px] uppercase tracking-[0.14em] text-white/45">{k}</dt>
                <dd className="mt-1 text-[14.5px] text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <ConfirmSetupForm options={destinationsForStart(goal)} suggested={suggestedDestination(plan)} hasWebsite={Boolean(plan.inputs.website)} />
          <p className="mt-5 text-[12.5px] text-white/50">
            Something wrong? <Link href="/onboarding?full=1" className="text-white/75 underline underline-offset-4 hover:text-white">Answer the full setup instead</Link>.
          </p>
        </section>
      </div>
    </JourneyFrame>
  );
}
