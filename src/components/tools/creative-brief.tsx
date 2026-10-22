"use client";

import { buildBrief, briefAsText, GOAL_RESULT, VARIABLE_LABEL, type BriefInput, type Placement, type TestVariable } from "@/lib/creative/brief";
import { money, num } from "@/lib/calc/economics";
import { Choice, CopyButton, DownloadButton, ExampleBadge, ExampleButton, NextStep, NumberField, Panel, ResultPanel, SelectField, TextField, useLocalState } from "./ui";

type S = BriefInput & { example: boolean };
const EMPTY: S = { business: "", offering: "", goal: "leads", customer: "", message: "", proof: "", offer: "", cta: "Get quote", format: "picture", placements: ["feed", "stories", "reels"], variable: "hook", versionA: "", versionB: "", dailyBudget: null, costPerResult: null, resultsEach: 20, example: false };
const EXAMPLE: S = { business: "Brightwater Plumbing (example)", offering: "emergency plumbing", goal: "leads", customer: "homeowners in Eastfield", message: "Leak help the same day, with a price before we come out.", proof: "", offer: "", cta: "Call now", format: "video", placements: ["feed", "reels"], variable: "hook", versionA: "Water coming through the ceiling?", versionB: "Emergency plumbing in Eastfield.", dailyBudget: 20, costPerResult: 18, resultsEach: 20, example: true };

export function CreativeBriefTool() {
  const [s, setS] = useLocalState<S>("creative-brief", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const ready = s.offering.trim() && s.message.trim() && s.versionA.trim() && s.versionB.trim();
  const b = ready ? buildBrief(s) : null;
  const text = b ? briefAsText(b) : "";
  const togglePlacement = (p: Placement) => set({ placements: s.placements.includes(p) ? s.placements.filter((x) => x !== p) : [...s.placements, p] });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">The ad<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="Business name" value={s.business} onChange={(v) => set({ business: v })} />
          <TextField label="What you sell" value={s.offering} onChange={(v) => set({ offering: v })} placeholder="e.g. emergency plumbing" />
          <SelectField label="What you want" value={s.goal} onChange={(v) => set({ goal: v })} options={(Object.keys(GOAL_RESULT) as BriefInput["goal"][]).map((g) => ({ value: g, label: `${GOAL_RESULT[g].charAt(0).toUpperCase()}${GOAL_RESULT[g].slice(1)}s` }))} />
          <TextField label="Who it's for" value={s.customer} onChange={(v) => set({ customer: v })} placeholder="e.g. homeowners in Eastfield" />
          <div className="sm:col-span-2"><TextField label="The one thing the ad must say" value={s.message} onChange={(v) => set({ message: v })} multiline /></div>
          <TextField label="Proof (only if true)" value={s.proof ?? ""} onChange={(v) => set({ proof: v })} />
          <TextField label="Offer (only if you run one)" value={s.offer ?? ""} onChange={(v) => set({ offer: v })} />
          <TextField label="Button" value={s.cta} onChange={(v) => set({ cta: v })} />
          <SelectField label="Format" value={s.format} onChange={(v) => set({ format: v })} options={[{ value: "picture", label: "Picture" }, { value: "video", label: "Video" }, { value: "carousel", label: "Carousel" }]} />
        </div>
        <fieldset className="mt-4">
          <legend className="text-[13.5px] font-medium text-white">Where it runs</legend>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[13.5px] text-white/80">
            {(["feed", "stories", "reels"] as Placement[]).map((p) => (
              <label key={p} className="flex items-center gap-2"><input type="checkbox" className="accent-[#ffffff]" checked={s.placements.includes(p)} onChange={() => togglePlacement(p)} />{p.charAt(0).toUpperCase() + p.slice(1)}</label>
            ))}
          </div>
        </fieldset>
        <p className="mt-6 text-[14px] font-semibold text-white">The first test</p>
        <div className="mt-3 grid gap-4">
          <Choice label="Change one thing" value={s.variable} onChange={(v) => set({ variable: v })} options={(Object.keys(VARIABLE_LABEL) as TestVariable[]).map((v) => ({ value: v, label: VARIABLE_LABEL[v] }))} />
          <TextField label="Version A" value={s.versionA} onChange={(v) => set({ versionA: v })} />
          <TextField label="Version B" value={s.versionB} onChange={(v) => set({ versionB: v })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Daily budget" value={s.dailyBudget ?? null} onChange={(v) => set({ dailyBudget: v })} prefix="$" />
            <NumberField label="Your cost-per-result estimate" value={s.costPerResult ?? null} onChange={(v) => set({ costPerResult: v })} prefix="$" />
            <NumberField label="Results each before deciding" value={s.resultsEach ?? null} onChange={(v) => set({ resultsEach: v })} step="1" min={10} max={200} />
          </div>
        </div>
      </Panel>
      <div className="space-y-5">
        {!b ? (
          <Panel><p className="text-[14px] text-white/80">Add what you sell, the message and two versions to see the brief.</p></Panel>
        ) : (
          <ResultPanel title="Your brief">
            <div className="space-y-3 text-[13.5px] leading-relaxed text-white/85">
              <p className="text-[16px] font-semibold text-white">{b.title}</p>
              <p><span className="text-white/55">Objective: </span>{b.objective}</p>
              <p><span className="text-white/55">Audience: </span>{b.audience}</p>
              <p><span className="text-white/55">Key message: </span>{b.message}</p>
              {b.proof && <p><span className="text-white/55">Proof: </span>{b.proof}</p>}
              {b.offer && <p><span className="text-white/55">Offer: </span>{b.offer}</p>}
              <div><p className="text-white/55">Must include</p><ul className="mt-1 list-disc pl-5">{b.mustInclude.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><p className="text-white/55">Avoid</p><ul className="mt-1 list-disc pl-5">{b.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><p className="text-white/55">Sizes and safe areas</p><ul className="mt-1 list-disc pl-5">{b.specs.map((x) => <li key={x.placement}><strong className="text-white">{x.placement}</strong> {x.ratio} ({x.size}). {x.safe}</li>)}</ul></div>
            </div>
            <div className="mt-5 rounded-xl border border-white/10 bg-paper/60 p-4 text-[13.5px] leading-relaxed text-white/85">
              <p className="font-semibold text-white">First test — {VARIABLE_LABEL[b.test.variable]}</p>
              <ul className="mt-2 space-y-1">{b.test.versions.map((v) => <li key={v.label}><span className="text-white/55">Version {v.label}: </span>{v.text}</li>)}</ul>
              <p className="mt-2"><span className="text-white/55">Keep the same: </span>{b.test.heldConstant.join(", ")}.</p>
              {b.test.budgetEach !== null && <p><span className="text-white/55">Budget: </span>{money(b.test.budgetEach)} a day each.</p>}
              {b.test.days !== null && <p><span className="text-white/55">Expected length: </span>about {num(b.test.days)} days, at your estimate.</p>}
              <p className="mt-2 text-white/55">Decision rule (written before the results)</p>
              <ul className="mt-1 list-disc pl-5">{b.test.rule.map((x) => <li key={x}>{x}</li>)}</ul>
              {b.test.warnings.map((w) => <p key={w} className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-amber-200">{w}</p>)}
              <p className="mt-2 text-[12px] text-white/50">A rule of thumb to avoid calling a winner on a handful of results — not a test of statistical significance.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton text={text} label="Copy brief" />
              <DownloadButton text={text} filename="mairo-creative-brief.txt" label="Download brief" />
            </div>
          </ResultPanel>
        )}
        {b && (
          <NextStep
            title="Run this test as your first campaign"
            body="Your free MAIRO plan can start from this brief; once you subscribe, MAIRO builds the test in your own Meta account for you to approve."
            action="Use this brief in my plan"
            handoff={{ kind: "note", tool: "creative-brief", label: "Creative brief and first test", text }}
          />
        )}
      </div>
    </div>
  );
}
