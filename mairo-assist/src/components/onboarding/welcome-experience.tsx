"use client";

import { Bot, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PlanCard } from "@/components/billing/plan-card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { PLAN_LIST } from "@/lib/billing/plans";
import { finishWelcome } from "@/lib/onboarding/actions";

// Fixed positions so server and client render the same particles.
const PARTICLES = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37) % 100,
  top: (i * 53 + 11) % 100,
  size: 2 + (i % 3),
  dur: 5 + (i % 5),
  delay: (i % 7) * 0.45,
  dx: ((i % 5) - 2) * 6,
  dy: -10 - (i % 4) * 6,
  hue: i % 2 ? "rgb(58 160 255 / 0.9)" : "rgb(139 108 255 / 0.9)",
}));

export function WelcomeExperience({ aiName, pickedPlanName }: { aiName: string | null; pickedPlanName: string | null }) {
  const [skipped, setSkipped] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const name = aiName ?? "Your AI Employee";

  useEffect(() => {
    if (!plansOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlansOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [plansOpen]);

  return (
    <div className="welcome-stage relative mx-auto flex min-h-[calc(100dvh-7rem)] max-w-3xl flex-col items-center justify-center overflow-hidden py-8 text-center" data-skipped={skipped} data-testid="welcome">
      <button
        type="button"
        onClick={() => setSkipped(true)}
        className="w-skip absolute right-0 top-0 z-10 rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-white/5 hover:text-fg"
        hidden={skipped}
      >
        Skip
      </button>

      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="w-particle absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              background: p.hue,
              boxShadow: `0 0 8px ${p.hue}`,
              ["--dur" as string]: `${p.dur}s`,
              ["--delay" as string]: `${p.delay}s`,
              ["--dx" as string]: `${p.dx}px`,
              ["--dy" as string]: `${p.dy}px`,
            }}
          />
        ))}
      </div>

      {/* The AI employee */}
      <div className="w-materialize relative mb-8 size-44 sm:size-56" aria-hidden>
        <div className="w-ring absolute inset-0 rounded-full border border-transparent [background:conic-gradient(from_0deg,rgb(124_92_255/0.9),transparent_35%,rgb(58_160_255/0.9)_60%,transparent_85%)_border-box] [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)]" style={{ borderWidth: 2 }} />
        <div className="w-ring-rev absolute inset-4 rounded-full border border-dashed border-electric/40" />
        <div className="w-core absolute inset-9 flex items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,#b9a6ff,#7c5cff_40%,#2a3bb8_75%,#0a0e20)] sm:inset-11">
          <Bot className="size-14 text-white drop-shadow-[0_0_12px_rgb(255_255_255/0.7)] sm:size-16" strokeWidth={1.5} />
          <div className="w-scan absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent via-cyan-glow/40 to-transparent" />
        </div>
      </div>

      <div className="relative w-full px-2">
        <div className="w-loading absolute inset-x-0 top-0 space-y-3" aria-hidden>
          <p className="text-lg text-fg-muted">Activating Your AI Employee…</p>
          <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-white/10">
            <div className="w-progress h-full origin-left rounded-full bg-gradient-to-r from-violet to-electric" />
          </div>
        </div>

        <div className="w-joined space-y-3" role="status">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-glow">{name}</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            <span className="text-gradient">Your New Employee Has Officially Joined the Team.</span>
          </h1>
          <p className="text-fg-muted">Available 24/7. Ready to help your customers. Powered by Mairo Assist.</p>
          <p className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-warning">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden /> Setup in progress — switches on once you finish setting up
          </p>
        </div>
      </div>

      <div className="w-joined-late mt-8 w-full max-w-md space-y-4">
        <div className="glass glow-ring rounded-2xl p-5 text-left" data-testid="welcome-plan">
          <p className="text-xs font-medium uppercase tracking-widest text-fg-subtle">Your plan</p>
          <p className="mt-1 text-2xl font-semibold">Free Forever</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {["100 AI Responses Every Month", "$0/month", "No Credit Card Required"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 text-success" aria-hidden /> {t}</li>
            ))}
          </ul>
          {pickedPlanName && (
            <p className="mt-3 text-xs text-fg-subtle">You picked {pickedPlanName} — you&apos;ll confirm it after setting up your business. You start on Free.</p>
          )}
        </div>
        <form action={finishWelcome}>
          <SubmitButton size="lg" className="w-full" pendingText="Starting setup…">Set Up My AI Employee</SubmitButton>
        </form>
        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setPlansOpen(true)}>
          Explore All Plans
        </Button>
      </div>

      {plansOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/90 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="All plans">
          <div className="mx-auto max-w-6xl px-4 py-10 text-left">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">All plans</h2>
                <p className="text-sm text-fg-muted">Your Free plan stays active while you look. You can upgrade any time from your dashboard.</p>
              </div>
              <button type="button" onClick={() => setPlansOpen(false)} className="rounded-lg p-2 text-fg-muted hover:bg-white/5" aria-label="Close plans">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {PLAN_LIST.map((p) => <PlanCard key={p.key} plan={p} compact current={p.key === "free"} />)}
            </div>
            <div className="mt-6 flex justify-center">
              <Button size="lg" onClick={() => setPlansOpen(false)}>Continue With Free</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
