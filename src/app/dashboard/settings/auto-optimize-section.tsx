"use client";

import { useActionState, useState } from "react";
import { saveAutoOptimizeAction } from "@/lib/actions/optimize-actions";
import { inputClass, primaryButtonClass, Card } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icons";
import type { AdPlatform } from "@/generated/prisma/enums";

// The switch that lets MAIRO move money on its own, and the fence around it.
//
// Everything on this form is a ceiling the customer sets, and every one of
// them is enforced on the server in src/lib/budget/optimizer.ts rather than
// here. This screen is where they are chosen; it is not what makes them true.
// That distinction matters enough to be worth stating in the interface too,
// which is why the note at the bottom says what MAIRO will and will not do
// rather than leaving it to be inferred from six numeric fields.

export type AutoOptimizeValues = {
  enabled: boolean;
  maxDailyBudget: number;
  maxDailyIncreasePercent: number;
  minRoas: number | null;
  maxCpa: number | null;
  platforms: AdPlatform[];
};

const SELECTABLE: AdPlatform[] = ["META", "TIKTOK"];

export function AutoOptimizeSection({
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
  const [enabled, setEnabled] = useState(values.enabled);
  const [platforms, setPlatforms] = useState<AdPlatform[]>(values.platforms);

  if (!allowed) {
    return (
      <Card>
        <h2 className="text-base text-white">Mairo Auto Optimize</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
          Let MAIRO move budget between platforms by itself, inside limits you set. Until
          you switch it on — and on every plan below {upgradePlanName} — MAIRO recommends
          changes and waits for you to approve them.
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

  return (
    <Card>
      <form action={formAction} className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base text-white">Mairo Auto Optimize</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-400">
              With this off, MAIRO recommends budget changes and you approve them. With it
              on, MAIRO can make them itself — but only the kinds of change below, and only
              inside the limits you set here.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-400">
              {enabled ? "On" : "Off"}
            </span>
            <span className="relative inline-block h-6 w-11">
              <input
                type="checkbox"
                name="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <span className="block h-6 w-11 rounded-full bg-white/10 transition peer-checked:bg-sky-400/70" />
              <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>

        <div className={enabled ? "space-y-6" : "space-y-6 opacity-50"}>
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

          {/* Said plainly, because six numeric fields do not add up to an
              understanding of what has just been agreed to. */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-neutral-300">
              What MAIRO will and won&rsquo;t do
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
              <li>Every change it makes is recorded, with the figures it was based on.</li>
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
