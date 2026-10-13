"use client";

import Link from "next/link";
import { READINESS_ITEMS, scoreReadiness, type ReadinessAnswer } from "@/lib/tools/readiness";
import { CopyButton, NextStep, Panel, ResultPanel, useLocalState } from "./ui";

export function OfferReadinessTool({ toolNames }: { toolNames: Record<string, string> }) {
  const [answers, setAnswers] = useLocalState<Record<string, ReadinessAnswer | undefined>>("offer-readiness", {});
  const r = scoreReadiness(answers);
  const groups = [...new Set(READINESS_ITEMS.map((i) => i.group))];
  const text = [`Ready to advertise? ${r.yes} of ${r.total} checklist items done (a checklist, not a prediction).`, ...(r.blockersOpen.length ? ["Fix first:", ...r.blockersOpen.map((i) => `- ${i.question} → ${i.next}`)] : []), ...(r.recommendedOpen.length ? ["Worth doing:", ...r.recommendedOpen.map((i) => `- ${i.question} → ${i.next}`)] : [])].join("\n");
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel>
        {groups.map((g) => (
          <fieldset key={g} className="mb-6 last:mb-0">
            <legend className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{g}</legend>
            <ul className="mt-2 space-y-3">
              {READINESS_ITEMS.filter((i) => i.group === g).map((i) => (
                <li key={i.id} className="rounded-xl border border-white/10 bg-paper/40 p-3.5">
                  <p className="text-[14px] text-white">{i.question}{i.blocker && <span className="ml-2 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10.5px] text-white/60">Must-have</span>}</p>
                  <div role="radiogroup" aria-label={i.question} className="mt-2 flex flex-wrap gap-2">
                    {(["yes", "no", "unsure"] as ReadinessAnswer[]).map((a) => (
                      <button key={a} type="button" role="radio" aria-checked={answers[i.id] === a} onClick={() => setAnswers((x) => ({ ...x, [i.id]: a }))} className={`min-h-[36px] rounded-full border px-3.5 text-[12.5px] ${answers[i.id] === a ? "border-violet/60 bg-violet/[0.12] text-white" : "border-white/12 text-white/70 hover:border-white/30"}`}>
                        {a === "yes" ? "Yes" : a === "no" ? "No" : "Not sure"}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </Panel>
      <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <ResultPanel title={`${r.yes} of ${r.total} done`}>
          <p className="text-[13px] leading-relaxed text-white/70">
            {r.verdict === "incomplete" ? `${r.total - r.answered} still to answer.` : r.verdict === "fix-blockers" ? "Fix the must-haves before spending on ads." : "The basics are in place."} This counts your answers; it can&rsquo;t predict whether the product will sell.
          </p>
          {r.blockersOpen.length > 0 && (
            <div className="mt-4">
              <p className="text-[13px] font-medium text-white">Fix first</p>
              <ul className="mt-1.5 space-y-2">
                {r.blockersOpen.map((i) => (
                  <li key={i.id} className="text-[13px] leading-relaxed text-white/80">
                    {i.next} {i.tool && <Link href={`/tools/${i.tool}`} className="text-violet-bright underline underline-offset-2">{toolNames[i.tool] ?? "Open the tool"}</Link>}
                    <span className="block text-[12px] text-white/50">{i.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.recommendedOpen.length > 0 && (
            <div className="mt-4">
              <p className="text-[13px] font-medium text-white">Worth doing</p>
              <ul className="mt-1.5 space-y-1.5">
                {r.recommendedOpen.map((i) => (
                  <li key={i.id} className="text-[13px] text-white/75">{i.next} {i.tool && <Link href={`/tools/${i.tool}`} className="text-violet-bright underline underline-offset-2">{toolNames[i.tool] ?? "Open the tool"}</Link>}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4"><CopyButton text={text} label="Copy the checklist" /></div>
        </ResultPanel>
        {r.verdict !== "incomplete" && (
          <NextStep title="Plan the first campaign" body="Your free MAIRO plan starts from where you are — including what still needs fixing on your page." action="Build my free ad plan" />
        )}
      </div>
    </div>
  );
}
