"use client";

import { useActionState, useMemo, useState } from "react";
import { createCampaignAction } from "@/lib/actions/campaign-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icons";
import { UpgradeModal, type UpgradeCopy } from "@/components/upgrade-modal";
import { recommendAllocation, rebalance, splitBudget } from "@/lib/budget/allocation";
import type { AdGoal, AdPlatform } from "@/generated/prisma/enums";

// Creating a campaign, which is now a question about places as well as money.
//
// The thing this screen is trying to protect is the feeling that the customer
// made ONE campaign. They name it once, set one budget, and pick where it
// should run; the fact that MAIRO will create two campaigns on two networks
// with two different objective vocabularies never surfaces. The split is shown
// because it is their money and hiding it would be worse — but it arrives
// already decided, with a recommendation, so the default path is to read it
// and carry on.

const OBJECTIVES: { value: AdGoal; label: string }[] = [
  { value: "LEADS", label: "Leads" },
  { value: "SALES", label: "Sales" },
  { value: "AWARENESS", label: "Awareness" },
  { value: "TRAFFIC", label: "Traffic" },
  { value: "APP_PROMOTION", label: "App promotion" },
];

type Choice = {
  key: string;
  platforms: AdPlatform[];
  label: string;
  sub: string;
  recommended?: boolean;
};

const CHOICES: Choice[] = [
  { key: "META", platforms: ["META"], label: "Meta", sub: "Facebook + Instagram" },
  { key: "TIKTOK", platforms: ["TIKTOK"], label: "TikTok", sub: "TikTok" },
  {
    key: "BOTH",
    platforms: ["META", "TIKTOK"],
    label: "Meta + TikTok",
    sub: "One campaign, both networks",
    recommended: true,
  },
];

export type PlanContext = {
  tiktokAllowed: boolean;
  crossPlatformAllowed: boolean;
  growthModeAllowed: boolean;
  currentPlanName: string;
  currentPlanPrice: number;
  upgradePlanName: string;
  upgradePlanPrice: number;
  /** Which networks actually have a connected account right now. */
  connected: AdPlatform[];
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function NewCampaignForm({ plan }: { plan: PlanContext }) {
  const [state, formAction, pending] = useActionState(createCampaignAction, undefined);

  const [choice, setChoice] = useState<string>(plan.tiktokAllowed ? "BOTH" : "META");
  const [objective, setObjective] = useState<AdGoal>("SALES");
  const [budget, setBudget] = useState<number>(50);
  const [growthMode, setGrowthMode] = useState(false);
  const [upgrade, setUpgrade] = useState<UpgradeCopy | null>(null);

  // Null means "MAIRO's recommendation, whatever it currently is". Once the
  // customer drags a slider this holds their numbers instead — but changing
  // the objective or the budget doesn't silently overwrite them, because a
  // deliberate split being reset by an unrelated edit is infuriating.
  const [manual, setManual] = useState<{ platform: AdPlatform; percent: number }[] | null>(null);

  const platforms = useMemo<AdPlatform[]>(
    () => CHOICES.find((c) => c.key === choice)?.platforms ?? ["META"],
    [choice]
  );

  const totalCents = Math.round((Number.isFinite(budget) ? budget : 0) * 100);

  // The same functions the server uses. Importing them rather than
  // reimplementing the weights in the client is what stops the preview and the
  // created campaign disagreeing.
  const allocations = useMemo(() => {
    if (manual && manual.length === platforms.length) {
      return splitBudget(totalCents, manual);
    }
    return recommendAllocation(platforms, objective, totalCents);
  }, [manual, platforms, objective, totalCents]);

  const isRecommended = manual === null;

  function pick(next: Choice) {
    const wantsTikTok = next.platforms.includes("TIKTOK");
    const isCross = next.platforms.length > 1;

    if (wantsTikTok && !plan.tiktokAllowed) {
      setUpgrade(tiktokUpgradeCopy(plan));
      return;
    }
    if (isCross && !plan.crossPlatformAllowed) {
      setUpgrade(tiktokUpgradeCopy(plan));
      return;
    }
    setChoice(next.key);
    // A different set of platforms invalidates a split made for the old set.
    setManual(null);
    if (!wantsTikTok) setGrowthMode(false);
  }

  function drag(platform: AdPlatform, percent: number) {
    const current: { platform: AdPlatform; percent: number }[] = allocations.map((a) => ({
      platform: a.platform,
      percent: a.percent,
    }));
    setManual(rebalance(current, platform, percent));
  }

  const notConnected = platforms.filter((p) => !plan.connected.includes(p));

  return (
    <>
      <form action={formAction} className="space-y-7">
        {/* Every platform's share travels as a pair of hidden fields. The
            server re-derives the money from them rather than trusting any
            amount the client computed. */}
        {allocations.map((a) => (
          <input key={`p-${a.platform}`} type="hidden" name="platforms" value={a.platform} />
        ))}
        {allocations.map((a) => (
          <input key={`v-${a.platform}`} type="hidden" name="percents" value={a.percent} />
        ))}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Campaign name</label>
            <input name="name" required className={inputClass} placeholder="Fall clothing" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">What do you want?</label>
            <select
              name="objective"
              required
              className={inputClass}
              value={objective}
              onChange={(e) => setObjective(e.target.value as AdGoal)}
            >
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Total daily budget</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                $
              </span>
              <input
                name="dailyBudget"
                type="number"
                min={1}
                step={1}
                required
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>
        </div>

        {/* ---- where ---- */}
        <fieldset className="space-y-3">
          <legend className="text-sm text-white">Where should Mairo advertise?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHOICES.map((c) => {
              const selected = choice === c.key;
              const locked = c.platforms.includes("TIKTOK") && !plan.tiktokAllowed;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pick(c)}
                  aria-pressed={selected}
                  className={`relative rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-sky-400/40 bg-sky-400/[0.07]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  {c.recommended && (
                    <span className="absolute right-3 top-3 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-sky-300">
                      Recommended
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    {c.platforms.map((p) => (
                      <PlatformIcon key={p} platform={p} className="h-4 w-4" />
                    ))}
                  </span>
                  <p className="mt-2.5 text-sm text-white">{c.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{c.sub}</p>
                  {locked && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-sky-300/70">
                      {plan.upgradePlanName}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* ---- the split ---- */}
        {platforms.length > 1 && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-white">How the budget is split</p>
              {isRecommended ? (
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-sky-300">
                  AI Recommended
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setManual(null)}
                  className="text-[11px] text-neutral-400 underline underline-offset-4 hover:text-white"
                >
                  Reset to recommended
                </button>
              )}
            </div>

            <div className="space-y-5">
              {allocations.map((a) => (
                <div key={a.platform}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <PlatformIcon platform={a.platform} className="h-4 w-4" />
                      {a.platform === "META" ? "Meta" : "TikTok"}
                    </span>
                    <span className="tabular-nums text-white">
                      {money(a.dailyBudgetCents)}
                      <span className="ml-2 text-neutral-500">{a.percent}%</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={a.percent}
                    onChange={(e) => drag(a.platform, Number(e.target.value))}
                    aria-label={`${a.platform === "META" ? "Meta" : "TikTok"} share of budget`}
                    className="w-full accent-sky-400"
                  />
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-neutral-500">
              Adds up to {allocations.reduce((s, a) => s + a.percent, 0)}% —{" "}
              {money(totalCents)} a day in total.
            </p>
          </div>
        )}

        {/* ---- growth mode ---- */}
        {platforms.includes("TIKTOK") && (
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
              growthMode
                ? "border-sky-400/30 bg-sky-400/[0.05]"
                : "border-white/[0.07] bg-white/[0.02]"
            }`}
          >
            <input
              type="checkbox"
              name="tiktokGrowthMode"
              checked={growthMode}
              onChange={(e) => {
                if (e.target.checked && !plan.growthModeAllowed) {
                  setUpgrade(tiktokUpgradeCopy(plan));
                  return;
                }
                setGrowthMode(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 accent-sky-400"
            />
            <span>
              <span className="text-sm text-white">TikTok Growth Mode</span>
              <span className="mt-1 block text-xs leading-relaxed text-neutral-500">
                For a business with little or no TikTok following. MAIRO writes
                TikTok-native creative with several hook variations, and builds the
                account up alongside the paid campaign.
              </span>
            </span>
          </label>
        )}

        {notConnected.length > 0 && (
          <p className="text-xs text-amber-300/80">
            {notConnected.map((p) => (p === "META" ? "Meta" : "TikTok")).join(" and ")}{" "}
            {notConnected.length === 1 ? "isn't" : "aren't"} connected yet — the campaign
            will be saved as a draft and go live once you connect{" "}
            {notConnected.length === 1 ? "it" : "them"} in Settings.
          </p>
        )}

        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Creating…" : "Create campaign"}
          </button>
          {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        </div>

        {state?.partial && state.partial.length > 0 && !state.error && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
            <p className="text-sm text-amber-200">
              Your campaign is live, but not everywhere.
            </p>
            <ul className="mt-2 space-y-1">
              {state.partial.map((f) => (
                <li key={f.platform} className="text-xs text-amber-200/80">
                  <span className="font-medium">{f.platform}:</span> {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      <UpgradeModal
        open={upgrade !== null}
        copy={upgrade ?? tiktokUpgradeCopy(plan)}
        onClose={() => setUpgrade(null)}
        onDecline={() => {
          // "Continue with Meta only" — put them somewhere that works rather
          // than just closing the dialog on a selection they can't submit.
          setChoice("META");
          setManual(null);
          setGrowthMode(false);
          setUpgrade(null);
        }}
      />
    </>
  );
}

function tiktokUpgradeCopy(plan: PlanContext): UpgradeCopy {
  return {
    title: "Reach customers beyond Meta.",
    subtitle: `Upgrade to Mairo ${plan.upgradePlanName} to launch your campaign across Facebook, Instagram, and TikTok from one place.`,
    benefits: [
      "TikTok Ads",
      "TikTok Growth Mode",
      "Cross-platform campaigns",
      "Platform-specific AI creatives",
      "Unified analytics",
      "AI budget allocation",
    ],
    currentPlanName: plan.currentPlanName,
    currentPlanPrice: plan.currentPlanPrice,
    upgradePlanName: plan.upgradePlanName,
    upgradePlanPrice: plan.upgradePlanPrice,
    declineLabel: "Continue with Meta only",
  };
}
