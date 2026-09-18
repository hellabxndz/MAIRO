"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdPlatform } from "@/generated/prisma/enums";
import { createCampaignAction, type CampaignActionState } from "@/lib/actions/campaign-actions";
import { inputClass } from "@/components/ui";
import { AnalysisScan } from "./analysis-scan";

// Telling MAIRO what to run, in four questions.
//
// The point of the product is that somebody who does not know what a campaign
// objective is can still buy advertising that works. So this asks what they
// want, not what the platform needs: "get more sales" rather than "conversions,
// optimising for purchase, 7-day click 1-day view".
//
// It posts to createCampaignAction — the same server action the advanced form
// uses. That matters more than it looks: entitlements, plan limits, audience
// normalisation, the launch path and every error message already live there and
// are already tested. A second creation path would be a second set of those
// rules, and the two would disagree within a month.
//
// One screen per question, because a single long form is the thing this
// replaces. Progress is shown as a rail rather than "step 2 of 4" — the count
// invites people to weigh whether it is worth starting.

type Service = {
  slug: string;
  name: string;
  platforms: AdPlatform[];
};

type Goal = {
  key: string;
  /** What the customer sees. */
  label: string;
  sub: string;
  /** What the platform is actually told to optimise for. */
  objective: "SALES" | "LEADS" | "TRAFFIC" | "AWARENESS";
};

// Six ways of saying four things. "Promote a product" and "get more sales" are
// the same objective to Meta, and a local business wanting to be known is
// chasing leads — but a florist does not think of herself as running a lead
// generation campaign, and making her translate is exactly the tax this product
// exists to remove.
const GOALS: Goal[] = [
  { key: "sales", label: "Get more sales", sub: "People buy from your site", objective: "SALES" },
  { key: "leads", label: "Get more leads", sub: "People enquire, call or book", objective: "LEADS" },
  { key: "product", label: "Promote a product", sub: "One thing, pushed hard", objective: "SALES" },
  { key: "local", label: "Promote a local business", sub: "People nearby find you", objective: "LEADS" },
  { key: "traffic", label: "Get website visitors", sub: "More people on your site", objective: "TRAFFIC" },
  { key: "awareness", label: "Grow awareness", sub: "More people know you exist", objective: "AWARENESS" },
];

type Props = {
  service: Service;
  /** Which of this service's networks are connected right now. */
  connected: AdPlatform[];
  business: {
    name: string;
    website: string | null;
    destinationType: "WEBSITE" | "PHONE_CALL" | "LEAD_FORM" | "DIRECT_MESSAGE";
    messageChannel: "MESSENGER" | "INSTAGRAM" | "WHATSAPP";
    phone: string | null;
  };
};

const PLATFORM_LABEL: Record<string, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
  SNAPCHAT: "Snapchat",
  PINTEREST: "Pinterest",
  LINKEDIN: "LinkedIn",
};

export function LaunchFlow({ service, connected, business }: Props) {
  const [state, formAction, pending] = useActionState<CampaignActionState, FormData>(
    createCampaignAction,
    undefined,
  );

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>(GOALS[0]);
  const [subject, setSubject] = useState(business.website ?? "");
  const [period, setPeriod] = useState<"daily" | "monthly">("monthly");
  const [amount, setAmount] = useState(600);

  // The analysis screen goes up the moment the form is submitted and comes down
  // only when the server answers. It is covering real work — the action writes
  // the campaign and talks to each network — so the wait is genuine rather than
  // a timer pretending to be one.
  //
  // Counted rather than a boolean, so a second attempt after an error shows the
  // screen again: `pending` is what decides during a submit, and the previous
  // error only takes the screen down once the new attempt has finished.
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const showAnalysis = attempt > 0 && (pending || !state?.error);

  // The action revalidates and returns rather than redirecting, so the
  // navigation happens here. Pushing rather than setting state keeps this out
  // of the cascade the set-state-in-effect rule exists to prevent.
  useEffect(() => {
    if (attempt > 0 && !pending && !state?.error) router.push("/dashboard/campaigns");
  }, [attempt, pending, state, router]);

  const missing = service.platforms.filter((p) => !connected.includes(p));
  const dailyCents = period === "daily" ? amount * 100 : Math.round((amount * 100) / 30);
  const monthly = period === "daily" ? amount * 30 : amount;

  if (showAnalysis) {
    return <AnalysisScan businessName={business.name} platforms={service.platforms} />;
  }

  const steps = ["What you want", "What you're advertising", "Budget", "Accounts"];

  return (
    <form
      action={formAction}
      onSubmit={() => setAttempt((n) => n + 1)}
      className="mx-auto max-w-2xl"
    >
      {/* Everything the server action needs, carried along rather than asked
          again. The advanced form on /dashboard/campaigns is where somebody
          changes targeting; this flow uses what the business already said at
          signup, which is the whole point of having asked. */}
      <input type="hidden" name="objective" value={goal.objective} />
      <input type="hidden" name="dailyBudget" value={(dailyCents / 100).toFixed(2)} />
      {service.platforms.map((p) => (
        <input key={p} type="hidden" name="platforms" value={p} />
      ))}
      <input type="hidden" name="name" value={campaignName(goal, business.name)} />
      <input type="hidden" name="destinationType" value={business.destinationType} />
      <input
        type="hidden"
        name="destinationValue"
        value={
          business.destinationType === "PHONE_CALL"
            ? (business.phone ?? "")
            : business.destinationType === "WEBSITE"
              ? subject
              : ""
        }
      />
      <input type="hidden" name="messageChannel" value={business.messageChannel} />
      <input type="hidden" name="formAuthor" value="MAIRO" />

      {/* The rail. Position without a countdown. */}
      <div className="mb-8 flex items-center gap-2" aria-hidden>
        {steps.map((s, i) => (
          <span
            key={s}
            className="h-0.5 flex-1 rounded-full transition-all duration-500 [transition-timing-function:var(--ease-mairo)]"
            style={{
              backgroundImage: i <= step ? "var(--mairo-ramp)" : "none",
              background: i <= step ? undefined : "var(--mairo-line)",
            }}
          />
        ))}
      </div>

      {step === 0 && (
        <Question
          title="What are you trying to achieve?"
          sub="MAIRO turns this into the campaign settings the platform needs. You never have to."
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {GOALS.map((g) => (
              <Choice
                key={g.key}
                selected={goal.key === g.key}
                onClick={() => setGoal(g)}
                label={g.label}
                sub={g.sub}
              />
            ))}
          </div>
        </Question>
      )}

      {step === 1 && (
        <Question
          title="What are you advertising?"
          sub="A link is enough — MAIRO reads the page and writes the ads from what it finds. If you would rather describe it, do that instead."
        >
          <textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            rows={4}
            className={inputClass}
            placeholder="yourbusiness.com/the-thing — or describe what you sell and who buys it"
          />
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            You can add your own images or video once the campaign is built. MAIRO will have
            written a first set by then.
          </p>
        </Question>
      )}

      {step === 2 && (
        <Question
          title="How much do you want to spend?"
          sub="This is the advertising budget, not what you pay MAIRO."
        >
          <div className="inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--mairo-line)" }}>
            {(["monthly", "daily"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  // Convert rather than reset, so switching units does not
                  // silently turn $600 a month into $600 a day.
                  setAmount(p === "daily" ? Math.max(5, Math.round(amount / 30)) : amount * 30);
                  setPeriod(p);
                }}
                className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium capitalize transition-all duration-300 ${
                  period === p ? "text-white" : "text-faint hover:text-muted"
                }`}
                style={period === p ? { backgroundImage: "var(--mairo-ramp)" } : undefined}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-[26px] text-faint">$</span>
            <input
              type="number"
              min={period === "daily" ? 5 : 150}
              step={period === "daily" ? 1 : 50}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 0))}
              className="w-40 bg-transparent text-[40px] font-semibold tabular-nums text-white outline-none"
            />
            <span className="text-[14px] text-muted">/ {period === "daily" ? "day" : "month"}</span>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            About {money(dailyCents)} a day, {money(monthly * 100)} a month.
          </p>

          {/* The single most misunderstood thing about this product. */}
          <div
            className="mt-6 rounded-xl border p-4"
            style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}
          >
            <p className="text-[13px] leading-relaxed text-white/90">
              Your advertising budget is paid directly to {service.name}, from your own account.
              MAIRO never holds it and never takes a cut of it — it decides how it gets used.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Your MAIRO subscription is separate, and is what you already pay us.
            </p>
          </div>
        </Question>
      )}

      {step === 3 && (
        <Question
          title={missing.length ? "One account to connect" : "Ready when you are"}
          sub={
            missing.length
              ? "MAIRO builds campaigns inside your own advertising account, so it needs access to it."
              : "MAIRO will build the campaign and bring it back for you to approve. Nothing spends until you do."
          }
        >
          <div className="space-y-2.5">
            {service.platforms.map((p) => {
              const on = connected.includes(p);
              return (
                <div
                  key={p}
                  className="flex items-center justify-between gap-3 rounded-xl border p-4"
                  style={{
                    borderColor: on ? "var(--mairo-line-lit)" : "var(--mairo-line)",
                    background: "rgba(10,16,32,0.4)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-[14px] text-white">{PLATFORM_LABEL[p] ?? p}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {on ? "Connected" : "Not connected yet"}
                    </p>
                  </div>
                  {on ? (
                    <span className="flex items-center gap-1.5 text-[12.5px] text-live">
                      <span className="h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
                      Ready
                    </span>
                  ) : (
                    <Link
                      href="/dashboard/integrations"
                      className="shrink-0 rounded-full border px-4 py-2 text-[12.5px] text-white/85 transition-colors hover:border-[color:var(--mairo-line-lit)] hover:text-white"
                      style={{ borderColor: "var(--mairo-line)" }}
                    >
                      Connect
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="mt-6 rounded-xl border p-4"
            style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}
          >
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">
              What MAIRO will do next
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Read what you are advertising, write the ads, choose who sees them, build the
              campaign in your account — paused — and show you all of it before anything runs.
            </p>
          </div>
        </Question>
      )}

      {state?.error && (
        <p className="mt-6 rounded-xl border border-alert/30 bg-alert/[0.06] px-4 py-3 text-[13px] text-alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={`text-[13px] text-muted transition-colors hover:text-white ${step === 0 ? "invisible" : ""}`}
        >
          ← Back
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 1 && subject.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
            style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
          >
            Continue
            <span aria-hidden>→</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending || missing.length > 0}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
            style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
          >
            {pending ? "Building…" : "Build my campaign"}
            <span aria-hidden>→</span>
          </button>
        )}
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- pieces */

function Question({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">{sub}</p>
      <div className="mt-7">{children}</div>
    </div>
  );
}

function Choice({
  selected,
  onClick,
  label,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="rounded-xl border p-4 text-left transition-all duration-300 [transition-timing-function:var(--ease-mairo)]"
      style={{
        borderColor: selected ? "rgba(108,158,255,0.5)" : "var(--mairo-line)",
        background: selected ? "rgba(61,125,255,0.08)" : "rgba(255,255,255,0.015)",
        boxShadow: selected ? "0 0 24px rgba(61,125,255,0.18)" : "none",
      }}
    >
      <p className="text-[14px] text-white">{label}</p>
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </button>
  );
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** A name somebody will recognise in a list, without asking them for one. */
function campaignName(goal: Goal, business: string): string {
  const month = new Date().toLocaleDateString(undefined, { month: "long" });
  const what =
    goal.objective === "SALES"
      ? "Sales"
      : goal.objective === "LEADS"
        ? "Enquiries"
        : goal.objective === "TRAFFIC"
          ? "Visitors"
          : "Awareness";
  return `${business} — ${what}, ${month}`;
}
