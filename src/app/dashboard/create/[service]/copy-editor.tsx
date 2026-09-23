"use client";

import { useEffect, useRef, useState } from "react";
import { writeAdCopyAction } from "@/lib/actions/campaign-wizard-actions";
import { inputClass } from "@/components/ui";
import {
  checkCopy,
  ctaChoicesFor,
  ctaLabel,
  fitCta,
  HEADLINE_SHOWN,
  maxTestAds,
  PRIMARY_TEXT_SHOWN,
  type CopyOption,
} from "@/lib/campaigns/ad-copy";
import { dollars, plannedSpend, type CampaignPlan } from "@/lib/campaigns/plan";
import { Choice, Note, SubQuestion } from "./wizard-parts";

// The ad's words: three versions MAIRO writes from what the business told it,
// one chosen and edited, and — if the budget allows — several run side by side
// so Meta can favour whichever people respond to.

export function CopyEditor({
  plan,
  update,
  assistantName,
}: {
  plan: CampaignPlan;
  update: (patch: Partial<CampaignPlan>) => void;
  assistantName: string;
}) {
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noButton = plan.destinationType === "POST_ENGAGEMENT";
  const ctas = ctaChoicesFor(plan.destinationType);
  const chosen = plan.copyOptions[plan.chosenCopy] ?? null;
  const cap = maxTestAds(plannedSpend(plan).perDayCents);

  async function write() {
    setWriting(true);
    setError(null);
    const result = await writeAdCopyAction(plan).catch(() => ({
      ok: false as const,
      error: "MAIRO couldn't write the ad text just now. Try again, or write your own below.",
    }));
    setWriting(false);
    if (result.ok) update({ copyOptions: result.options, chosenCopy: 0, testPicks: [], testing: false });
    else setError(result.error);
  }

  // Written as soon as the ad has a picture or video, so there's something to
  // react to rather than a blank box.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || plan.copyOptions.length > 0) return;
    asked.current = true;
    void write();
    // write() reads the plan as it is now; running once is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function edit(patch: Partial<CopyOption>) {
    update({
      copyOptions: plan.copyOptions.map((c, i) => (i === plan.chosenCopy ? { ...c, ...patch } : c)),
    });
  }

  function writeOwn() {
    const blank: CopyOption = { angle: "Your own words", primaryText: "", headline: "", cta: fitCta("LEARN_MORE", plan.destinationType) };
    update({ copyOptions: [...plan.copyOptions, blank], chosenCopy: plan.copyOptions.length });
  }

  function togglePick(i: number) {
    const picks = plan.testPicks.includes(i) ? plan.testPicks.filter((x) => x !== i) : [...plan.testPicks, i];
    update({ testPicks: picks });
  }

  const findings = chosen ? checkCopy(chosen, plan.destinationType) : [];
  const running = plan.testing ? new Set([plan.chosenCopy, ...plan.testPicks]) : new Set([plan.chosenCopy]);

  return (
    <SubQuestion
      title="The words on your ad"
      sub={`${assistantName} wrote these from what you told it about the business — nothing invented. Pick one and change anything.`}
    >
      {writing && <p className="text-[13px] text-muted">Writing three versions…</p>}
      {error && <Note tone="warn">{error}</Note>}

      {plan.copyOptions.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-3">
          {plan.copyOptions.map((c, i) => (
            <Choice
              key={i}
              selected={i === plan.chosenCopy}
              onClick={() => update({ chosenCopy: i })}
              label={`${i + 1}. ${c.angle}`}
              sub={c.primaryText.slice(0, 110) || "(empty)"}
              badge={plan.testing && running.has(i) ? "In test" : null}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4">
        <button type="button" onClick={() => void write()} disabled={writing}
          className="text-[12.5px] text-muted underline underline-offset-4 hover:text-white disabled:opacity-40">
          {plan.copyOptions.length ? "Write three new versions" : "Write my ad text"}
        </button>
        <button type="button" onClick={writeOwn} className="text-[12.5px] text-muted underline underline-offset-4 hover:text-white">
          Write my own
        </button>
      </div>

      {chosen && (
        <div className="mt-6 grid max-w-xl gap-4">
          <label className="block">
            <span className="flex justify-between text-[12.5px] text-white/85">
              <span>Text above the ad</span>
              <span className={chosen.primaryText.length > PRIMARY_TEXT_SHOWN ? "text-amber-200/90" : "text-faint"}>
                {chosen.primaryText.length}/{PRIMARY_TEXT_SHOWN} shown
              </span>
            </span>
            <textarea value={chosen.primaryText} onChange={(e) => edit({ primaryText: e.target.value })} rows={3} className={`${inputClass} mt-1.5`} />
          </label>
          {!noButton && (
            <label className="block">
              <span className="flex justify-between text-[12.5px] text-white/85">
                <span>Headline</span>
                <span className={chosen.headline.length > HEADLINE_SHOWN ? "text-amber-200/90" : "text-faint"}>
                  {chosen.headline.length}/{HEADLINE_SHOWN}
                </span>
              </span>
              <input value={chosen.headline} onChange={(e) => edit({ headline: e.target.value })} className={`${inputClass} mt-1.5`} />
            </label>
          )}
          {!noButton && (
            <label className="block">
              <span className="text-[12.5px] text-white/85">Button</span>
              {ctas.length > 1 ? (
                <select value={fitCta(chosen.cta, plan.destinationType)} onChange={(e) => edit({ cta: e.target.value })}
                  className="mt-1.5 block w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] text-white outline-none" style={{ borderColor: "var(--mairo-line)" }}>
                  {ctas.map((c) => (
                    <option key={c.value} value={c.value} className="bg-neutral-900">{c.label}</option>
                  ))}
                </select>
              ) : (
                <span className="mt-1.5 block text-[13px] text-muted">{ctaLabel(ctas[0].value)} — the only button that works for where this ad sends people.</span>
              )}
            </label>
          )}
          {findings.length > 0 && (
            <Note tone={findings.some((f) => f.level === "problem") ? "warn" : "neutral"}>
              {findings.map((f) => (
                <span key={f.text} className="block">{f.text}</span>
              ))}
            </Note>
          )}
        </div>
      )}

      {plan.copyOptions.length > 1 && (
        <div className="mt-8">
          <p className="text-[14px] text-white">Test more than one version?</p>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
            Each version runs as its own ad in the same campaign. Meta shows more of whichever people respond to — the budget
            is shared, not multiplied.
          </p>
          {cap < 2 ? (
            <p className="mt-3 text-[12.5px] text-faint">
              At {dollars(plannedSpend(plan).perDayCents)} a day there isn&rsquo;t enough to test fairly — each version needs about $5 a
              day. Raise the budget to $10 a day or more to test two.
            </p>
          ) : (
            <>
              <div className="mt-3 inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--mairo-line)" }}>
                {[
                  { on: false, text: "Just the one" },
                  { on: true, text: `Test up to ${cap}` },
                ].map((o) => (
                  <button key={o.text} type="button" aria-pressed={plan.testing === o.on}
                    onClick={() => update({ testing: o.on, testPicks: o.on && plan.testPicks.length === 0 ? plan.copyOptions.map((_, i) => i).filter((i) => i !== plan.chosenCopy).slice(0, cap - 1) : plan.testPicks })}
                    className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-all duration-300 ${plan.testing === o.on ? "text-white" : "text-faint hover:text-muted"}`}
                    style={plan.testing === o.on ? { backgroundImage: "var(--mairo-ramp)" } : undefined}>
                    {o.text}
                  </button>
                ))}
              </div>
              {plan.testing && (
                <div className="mt-3 space-y-2">
                  {plan.copyOptions.map((c, i) => {
                    const main = i === plan.chosenCopy;
                    const on = main || plan.testPicks.includes(i);
                    const full = !on && running.size >= cap;
                    return (
                      <label key={i} className={`flex items-center gap-2.5 text-[13px] ${full ? "text-faint" : "text-white/90"}`}>
                        <input type="checkbox" checked={on} disabled={main || full} onChange={() => togglePick(i)} className="h-4 w-4 accent-[#6c9eff]" />
                        {i + 1}. {c.angle}
                        {main && <span className="text-[11px] text-faint">(main version)</span>}
                      </label>
                    );
                  })}
                  <p className="text-[11.5px] text-faint">
                    {running.size} version{running.size === 1 ? "" : "s"} · about {dollars(Math.round(plannedSpend(plan).perDayCents / running.size))} a day each to start.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SubQuestion>
  );
}
