"use client";

import { buildUtm, META_DYNAMIC, tidyValue } from "@/lib/calc/utm";
import { CopyButton, ExampleBadge, ExampleButton, NextStep, Panel, Problems, ResultPanel, TextField, useLocalState } from "./ui";

type S = { url: string; source: string; medium: string; campaign: string; content: string; term: string; example: boolean };
const EMPTY: S = { url: "", source: "facebook", medium: "paid_social", campaign: "", content: "", term: "", example: false };
const EXAMPLE: S = { url: "brightwater-plumbing.example/emergency", source: "facebook", medium: "paid_social", campaign: "{{campaign.name}}", content: "{{ad.name}}", term: "", example: true };

export function UtmBuilderTool() {
  const [s, setS] = useLocalState<S>("utm-builder", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const r = buildUtm(s);
  const insert = (field: "campaign" | "content" | "term", v: string) => set({ [field]: v } as Partial<S>);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">Your link<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4">
          <TextField label="The page the ad sends people to" value={s.url} onChange={(v) => set({ url: v })} placeholder="yourbusiness.com/offer" maxLength={2000} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Source" hint="Where the visitor came from." value={s.source} onChange={(v) => set({ source: v })} />
            <TextField label="Medium" hint="The kind of traffic." value={s.medium} onChange={(v) => set({ medium: v })} />
          </div>
          <TextField label="Campaign" value={s.campaign} onChange={(v) => set({ campaign: v })} placeholder="e.g. spring-repairs, or a Meta value below" />
          <TextField label="Content (optional)" hint="Tells two ads in one campaign apart." value={s.content} onChange={(v) => set({ content: v })} />
          <TextField label="Term (optional)" value={s.term} onChange={(v) => set({ term: v })} />
        </div>
        <div className="mt-4">
          <p className="text-[13px] font-medium text-white">Let Meta fill values in when the ad runs</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {META_DYNAMIC.map((d) => (
              <span key={d.value} className="inline-flex items-center gap-1 rounded-full border border-white/12 px-2.5 py-1 text-[12px] text-white/75">
                {d.label}
                <button type="button" className="text-violet-bright hover:text-white" onClick={() => insert("campaign", d.value)} aria-label={`Use ${d.label} as the campaign`}>campaign</button>
                <button type="button" className="text-violet-bright hover:text-white" onClick={() => insert("content", d.value)} aria-label={`Use ${d.label} as the content`}>content</button>
              </span>
            ))}
          </div>
          <button type="button" className="mt-3 text-[12.5px] text-white/60 underline underline-offset-2 hover:text-white" onClick={() => set({ source: tidyValue(s.source), medium: tidyValue(s.medium), campaign: tidyValue(s.campaign), content: tidyValue(s.content), term: tidyValue(s.term) })}>
            Tidy values (lowercase, hyphens)
          </button>
        </div>
      </Panel>
      <div className="space-y-5">
        {!r.ok ? (
          <Problems problems={r.problems} />
        ) : (
          <ResultPanel>
            <p className="text-[13px] font-medium text-white">Tagged link</p>
            <p className="mt-1.5 break-all rounded-lg bg-paper/70 px-3 py-2.5 font-mono text-[12.5px] text-white/90">{r.url}</p>
            <div className="mt-2"><CopyButton text={r.url} label="Copy link" /></div>
            <p className="mt-5 text-[13px] font-medium text-white">Or paste just this into Meta&rsquo;s &ldquo;URL parameters&rdquo; field</p>
            <p className="mt-1.5 break-all rounded-lg bg-paper/70 px-3 py-2.5 font-mono text-[12.5px] text-white/90">{r.parameters}</p>
            <div className="mt-2"><CopyButton text={r.parameters} label="Copy parameters" /></div>
            {r.replaced.length > 0 && <p className="mt-3 text-[12.5px] text-amber-200">Replaced existing {r.replaced.join(", ")} on the address.</p>}
            <p className="mt-4 text-[12.5px] leading-relaxed text-white/60">Tags tell your analytics which ad sent a visitor. They don&rsquo;t count purchases or leads by themselves — that needs your Meta pixel or a lead form. Don&rsquo;t put names, emails or other personal details in a link.</p>
          </ResultPanel>
        )}
        {r.ok && (
          <NextStep title="Check the rest of your tracking" body="Your free MAIRO plan lists what your campaign needs counted — and whether it's in place yet." action="Build my free ad plan" handoff={{ kind: "website", tool: "utm-builder", url: (() => { try { return new URL(r.url).origin; } catch { return s.url; } })() }} />
        )}
      </div>
    </div>
  );
}
