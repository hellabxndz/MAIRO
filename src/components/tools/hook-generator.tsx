"use client";

import { useState } from "react";
import { ANGLE_LABEL, generateHooks, suggestedPair, type HookInput } from "@/lib/creative/hooks";
import { CopyButton, ExampleBadge, ExampleButton, NextStep, Panel, ResultPanel, TextField, secondaryBtn, useLocalState } from "./ui";

type S = HookInput & { example: boolean };
const EMPTY: S = { offering: "", customer: "", problem: "", outcome: "", offer: "", location: "", proof: "", objection: "", moment: "", example: false };
const EXAMPLE: S = { offering: "Emergency plumbing", customer: "homeowners", problem: "a burst pipe", outcome: "your water back on the same day", offer: "", location: "Eastfield", proof: "", objection: "call-out fees", moment: "a leak at midnight", example: true };

const LABELS: Record<keyof HookInput, string> = {
  offering: "What you sell",
  customer: "Who it's for",
  problem: "The problem you solve",
  outcome: "The result they want",
  offer: "Your current offer — only one you really run",
  location: "Where you work",
  proof: "Proof you can stand behind",
  objection: "A doubt that stops people buying",
  moment: "The moment they need you",
};
const PLACEHOLDERS: Partial<Record<keyof HookInput, string>> = {
  offering: "e.g. Emergency plumbing",
  customer: "e.g. homeowners",
  problem: "e.g. a burst pipe",
  outcome: "e.g. your water back on the same day",
  offer: "Leave empty if you don't have one",
  location: "e.g. Eastfield",
  proof: "e.g. family-run since 2009",
  objection: "e.g. call-out fees",
  moment: "e.g. a leak at midnight",
};

export function HookGeneratorTool() {
  const [s, setS] = useLocalState<S>("hook-generator", EMPTY);
  const [variant, setVariant] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const set_ = generateHooks(s, variant);
  const pair = suggestedPair(set_);
  const all = set_.hooks.map((h) => `${ANGLE_LABEL[h.angle]}: ${h.text}`).join("\n");
  const chosen = picked.length ? picked : pair ? pair.map((h) => h.text) : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">About your business<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <p className="mt-1 text-[13px] text-muted">Only the first is needed. Each extra answer unlocks another angle — nothing is made up to fill a gap.</p>
        <div className="mt-4 grid gap-4">
          {(Object.keys(LABELS) as (keyof HookInput)[]).map((k) => (
            <TextField key={k} label={LABELS[k]} value={s[k] ?? ""} onChange={(v) => set({ [k]: v } as Partial<S>)} placeholder={PLACEHOLDERS[k]} maxLength={120} />
          ))}
        </div>
      </Panel>
      <div className="space-y-5">
        {!set_.hooks.length ? (
          <Panel><p className="text-[14px] text-white/80">Tell MAIRO what you sell to see hooks.</p></Panel>
        ) : (
          <ResultPanel title={`${set_.hooks.length} hooks, ${set_.hooks.length} different angles`}>
            <ul className="space-y-3">
              {set_.hooks.map((h) => {
                const on = picked.includes(h.text);
                return (
                  <li key={h.angle} className="rounded-xl border border-white/10 bg-paper/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-violet-bright">{ANGLE_LABEL[h.angle]}</p>
                      <label className="flex items-center gap-2 text-[12.5px] text-white/70">
                        <input type="checkbox" className="accent-[#2f6bff]" checked={on} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, h.text] : p.filter((x) => x !== h.text)))} />
                        Use in my plan
                      </label>
                    </div>
                    <p className="mt-1.5 text-[16px] font-medium leading-snug text-white">{h.text}</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/65">{h.why} <span className="text-white/45">Works well as: {h.bestFor}.</span></p>
                    {h.warnings.map((w) => <p key={w} className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-[12.5px] text-amber-200">{w}</p>)}
                    <div className="mt-2.5"><CopyButton text={h.text} /></div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={secondaryBtn} onClick={() => setVariant((v) => v + 1)}>Show other wordings</button>
              <CopyButton text={all} label="Copy all" />
            </div>
            {set_.skipped.length > 0 && (
              <p className="mt-4 text-[12.5px] leading-relaxed text-white/55">
                Not written, because you didn&rsquo;t give what they need: {set_.skipped.map((x) => ANGLE_LABEL[x.angle]).join(", ")}. Add an answer to unlock one.
              </p>
            )}
            {pair && !picked.length && (
              <p className="mt-3 text-[13px] leading-relaxed text-white/80">
                Worth testing first: <strong className="text-white">{ANGLE_LABEL[pair[0].angle]}</strong> against <strong className="text-white">{ANGLE_LABEL[pair[1].angle]}</strong> — two different reasons to stop, so the result tells you something.
              </p>
            )}
          </ResultPanel>
        )}
        {chosen.length > 0 && (
          <NextStep
            title="Test these in a real campaign"
            body={`Your free MAIRO plan can start with ${picked.length ? "the hooks you ticked" : "the two suggested hooks"} and set up the test: one change at a time, judged on cost per result.`}
            action="Use these hooks in my plan"
            handoff={{ kind: "hooks", tool: "hook-generator", hooks: chosen }}
          />
        )}
      </div>
    </div>
  );
}
