"use client";

import { useActionState, useState } from "react";
import { saveAutoOptimizeAction } from "@/lib/actions/optimize-actions";
import { inputClass, primaryButtonClass, Card } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icons";
import type { AdPlatform, AutomationLevel } from "@/generated/prisma/enums";
import {
  ALWAYS_NEEDS_APPROVAL,
  actionInfo,
  automaticActions,
  LEVELS,
} from "@/lib/automation/levels";

// How much MAIRO is allowed to do without asking.
//
// This was an on/off switch called Auto Optimize, and the trouble with a
// switch is that its meaning lives wherever the code happens to be this month.
// A customer turning it on was agreeing to something nobody had written down.
//
// Three named levels instead, each showing its own inventory: what happens on
// its own, and what still waits for a person. The lists are not decoration and
// they are not maintained here — they are read from src/lib/automation/levels.ts,
// the same module the server asks before it does anything, so the promise on
// this screen and the behaviour in the account cannot drift apart.
//
// The numeric limits below are ceilings the customer sets, and they are
// enforced server-side in src/lib/budget/optimizer.ts. This screen is where
// they are chosen; it is not what makes them true.

export type AutoOptimizeValues = {
  level: AutomationLevel;
  maxDailyBudget: number;
  maxDailyIncreasePercent: number;
  maxBudgetShiftPercent: number;
  minRoas: number | null;
  maxCpa: number | null;
  platforms: AdPlatform[];
};

const SELECTABLE: AdPlatform[] = ["META", "TIKTOK"];

export function AutomationSection({
  values,
  allowed,
  upgradePlanName,
}: {
  values: AutoOptimizeValues;
  /** False on plans without auto_optimize — the form renders locked. */
  allowed: boolean;
  upgradePlanName: string;
}) {
  const [state, formAction, pending] = useActionState(saveAutoOptimizeAction, undefined);
  const [level, setLevel] = useState<AutomationLevel>(values.level);
  const [platforms, setPlatforms] = useState<AdPlatform[]>(values.platforms);

  // Manual is always available: it is the setting where MAIRO does nothing on
  // its own, so there is nothing to sell. The plan gates the two that act.
  const locked = !allowed;
  const automatic = automaticActions(level);

  if (locked && values.level === "MANUAL") {
    return (
      <Card id="automation">
        <h2 className="text-base text-white">What MAIRO may do on its own</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
          Right now MAIRO recommends changes and waits for you to approve every one. On
          {" "}{upgradePlanName} you can let it handle the small things itself — pausing an
          ad that is losing money, testing a new creative, moving budget between what you
          already run — inside limits you set. It never raises your total budget, launches
          a campaign or spends past your ceiling, on any plan.
        </p>
        <a
          href="#billing"
          className="mt-4 inline-block rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs text-sky-200 transition hover:bg-sky-400/20"
        >
          Part of {upgradePlanName}
        </a>
      </Card>
    );
  }

  const acting = level !== "MANUAL";

  return (
    <Card id="automation">
      <form action={formAction} className="space-y-6">
        <div>
          <h2 className="text-base text-white">What MAIRO may do on its own</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
            Pick how much you want to be involved. Whichever you choose, you can see every
            change MAIRO makes and why it made it.
          </p>
        </div>

        {/* The level itself. Radio cards rather than a select: the difference
            between these three is a paragraph each, and a dropdown hides two of
            the three behind a click at the moment somebody is deciding how much
            of their budget to hand over. */}
        <input type="hidden" name="level" value={level} />
        <div className="grid gap-3 sm:grid-cols-3">
          {LEVELS.map((l) => {
            const on = l.level === level;
            const needsPlan = locked && l.level !== "MANUAL";
            return (
              <button
                key={l.level}
                type="button"
                disabled={needsPlan}
                onClick={() => setLevel(l.level)}
                aria-pressed={on}
                className={`rounded-2xl border p-4 text-left transition-all duration-300 [transition-timing-function:var(--ease-mairo)] ${
                  on
                    ? "border-sky-400/50 bg-sky-400/[0.07]"
                    : "border-white/[0.07] hover:border-white/20"
                } ${needsPlan ? "cursor-not-allowed opacity-45" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-3.5 w-3.5 rounded-full border ${
                      on ? "border-sky-300 bg-sky-400" : "border-white/25"
                    }`}
                  />
                  <span className="text-sm font-medium text-white">{l.label}</span>
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-neutral-400">
                  {l.summary}
                </span>
                {needsPlan && (
                  <span className="mt-2 block text-[11px] text-sky-200/80">
                    Part of {upgradePlanName}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* The inventory. Read from the same module the server checks, so this
            cannot promise something the account does not do. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-neutral-300">
              MAIRO can do these without asking
            </p>
            {automatic.length === 0 ? (
              <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">
                Nothing. On Manual, MAIRO recommends and waits for you every time.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-2.5">
                {automatic.map((a) => (
                  <li key={a.action}>
                    <span className="flex items-start gap-2 text-xs text-neutral-200">
                      <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-live" />
                      {a.label}
                    </span>
                    <span className="mt-0.5 block pl-3.5 text-[11px] leading-relaxed text-neutral-500">
                      {a.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-neutral-300">These always ask you first</p>
            <ul className="mt-2.5 space-y-2.5">
              {ALWAYS_NEEDS_APPROVAL.map(actionInfo).map((a) => (
                <li key={a.action}>
                  <span className="flex items-start gap-2 text-xs text-neutral-200">
                    <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                    {a.label}
                  </span>
                  <span className="mt-0.5 block pl-3.5 text-[11px] leading-relaxed text-neutral-500">
                    {a.detail}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
              These four are not a setting. No level turns them off, and neither can we.
            </p>
          </div>
        </div>

        <div className={acting ? "space-y-6" : "space-y-6 opacity-50"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Maximum daily budget"
              hint="Across every platform. MAIRO will never take total spend above this."
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                  $
                </span>
                <input
                  name="maxDailyBudget"
                  type="number"
                  min={1}
                  step={1}
                  required
                  defaultValue={values.maxDailyBudget}
                  className={`${inputClass} pl-7`}
                />
              </div>
            </Field>

            <Field
              label="Maximum increase per day"
              hint="As a share of a platform's current budget. Stops a good week compounding into a bad month."
            >
              <div className="relative">
                <input
                  name="maxDailyIncreasePercent"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  defaultValue={values.maxDailyIncreasePercent}
                  className={`${inputClass} pr-8`}
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                  %
                </span>
              </div>
            </Field>

            <Field
              label="Most of a budget MAIRO may move in a day"
              hint="A share of the campaign's own budget. The total never changes — this caps how much of it moves at once."
            >
              <div className="relative">
                <input
                  name="maxBudgetShiftPercent"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  defaultValue={values.maxBudgetShiftPercent}
                  className={`${inputClass} pr-8`}
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                  %
                </span>
              </div>
            </Field>

            <Field
              label="Minimum ROAS target"
              hint="Below this, MAIRO may only reduce spend. Leave blank for no floor."
            >
              <input
                name="minRoas"
                type="number"
                min={0}
                step={0.1}
                placeholder="e.g. 2.0"
                defaultValue={values.minRoas ?? ""}
                className={inputClass}
              />
            </Field>

            <Field
              label="Maximum cost per purchase"
              hint="Above this, MAIRO may only reduce spend. Leave blank for no ceiling."
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                  $
                </span>
                <input
                  name="maxCpa"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="e.g. 30"
                  defaultValue={values.maxCpa ?? ""}
                  className={`${inputClass} pl-7`}
                />
              </div>
            </Field>
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-neutral-400">
              Platforms MAIRO may optimize
            </legend>
            <p className="mt-1 text-xs text-neutral-500">
              Anything not ticked here, MAIRO will only ever make recommendations about.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {SELECTABLE.map((platform) => {
                const on = platforms.includes(platform);
                return (
                  <label
                    key={platform}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-full border px-4 py-2 text-xs transition ${
                      on
                        ? "border-sky-400/40 bg-sky-400/[0.08] text-white"
                        : "border-white/[0.07] text-neutral-400 hover:border-white/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="platforms"
                      value={platform}
                      checked={on}
                      onChange={(e) =>
                        setPlatforms((prev) =>
                          e.target.checked
                            ? [...prev, platform]
                            : prev.filter((p) => p !== platform)
                        )
                      }
                      className="sr-only"
                    />
                    <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                    {platform === "META" ? "Meta" : "TikTok"}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Said plainly, because seven numeric fields do not add up to an
              understanding of what has just been agreed to. */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-neutral-300">
              How MAIRO behaves inside these limits
            </p>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-neutral-500">
              <li>
                It moves budget <span className="text-neutral-300">between</span> the
                platforms in a campaign. It never raises the campaign&rsquo;s total.
              </li>
              <li>It never takes a platform below 10% — a platform at zero can&rsquo;t recover.</li>
              <li>
                It acts only on campaigns with enough evidence to be worth acting on, which
                in practice means a couple of hundred clicks or twenty-odd purchases.
              </li>
              <li>
                Every change it makes is recorded with the figures behind it, in{" "}
                <span className="text-neutral-300">Mairo Activity</span> on your dashboard.
              </li>
              <li>Changing back to Manual stops it acting immediately.</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Saving…" : "Save limits"}
          </button>
          {state?.saved && <p className="text-sm text-emerald-400">Saved.</p>}
          {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-400">{label}</label>
      {children}
      <p className="text-[11px] leading-relaxed text-neutral-500">{hint}</p>
    </div>
  );
}
