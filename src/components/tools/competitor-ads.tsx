"use client";

import { AD_LIBRARY_COUNTRIES, adLibraryUrl, CAVEATS, hypothesesFrom, type AdNote } from "@/lib/tools/ad-library";
import { CopyButton, DownloadButton, NextStep, Panel, ResultPanel, SelectField, TextField, primaryBtn, secondaryBtn, useLocalState } from "./ui";

type S = { query: string; country: string; offering: string; notes: AdNote[] };
const BLANK: AdNote = { hook: "", offer: "", format: "", since: "", notes: "" };
const EMPTY: S = { query: "", country: "US", offering: "", notes: [{ ...BLANK }] };

export function CompetitorAdsTool() {
  const [s, setS] = useLocalState<S>("competitor-ads", EMPTY);
  const url = adLibraryUrl(s.query, s.country);
  const hyps = hypothesesFrom(s.notes, s.offering);
  const setNote = (n: number, p: Partial<AdNote>) => setS((x) => ({ ...x, notes: x.notes.map((a, i) => (i === n ? { ...a, ...p } : a)) }));
  const text = [
    `Ad Library notes — ${s.query || "competitor"} (${s.country}), written ${new Date().toLocaleDateString("en-US")}`,
    ...s.notes.filter((n) => n.hook || n.offer || n.notes).map((n, i) => `Ad ${i + 1}: opens with "${n.hook}"; offer: ${n.offer || "none seen"}; format: ${n.format || "?"}; running since: ${n.since || "?"}. ${n.notes}`),
    "",
    "Test ideas for my business:",
    ...hyps.map((h) => `- ${h}`),
    "",
    ...CAVEATS.map((c) => `Note: ${c}`),
  ].join("\n");
  return (
    <div className="space-y-5">
      <div role="note" className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-white/80">
        <p className="font-medium text-white">A guided search, not automated research.</p>
        <p className="mt-1">MAIRO opens Meta&rsquo;s public Ad Library for you and helps you take notes. It doesn&rsquo;t collect ads automatically — Meta&rsquo;s Ad Library API only covers political and social-issue ads (and ads shown in the EU) — so nothing here claims to be a complete list.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <p className="text-[15px] font-semibold text-white">1. Search the Ad Library</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField label="Competitor or Page name" value={s.query} onChange={(v) => setS((x) => ({ ...x, query: v }))} placeholder="e.g. a local competitor's name" maxLength={100} />
            <SelectField label="Country" value={s.country} onChange={(v) => setS((x) => ({ ...x, country: v }))} options={AD_LIBRARY_COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
          </div>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} mt-4`}>Open Meta&rsquo;s Ad Library <span aria-hidden>↗</span></a>
          ) : (
            <p className="mt-4 text-[13px] text-white/55">Enter a name to get the search link.</p>
          )}
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-white/70">
            <li>Pick the right Page from the results — names can be similar.</li>
            <li>Look at three to five active ads.</li>
            <li>Note how each opens, its offer, its format and when it started running.</li>
          </ol>
          <p className="mt-6 text-[15px] font-semibold text-white">2. Your notes</p>
          <TextField label="What you sell (for the test ideas)" value={s.offering} onChange={(v) => setS((x) => ({ ...x, offering: v }))} />
          <div className="mt-4 space-y-4">
            {s.notes.map((n, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-paper/40 p-3.5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/55">Ad {i + 1}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <TextField label="How it opens" value={n.hook} onChange={(v) => setNote(i, { hook: v })} placeholder="In your own words" />
                  <TextField label="Offer, if any" value={n.offer} onChange={(v) => setNote(i, { offer: v })} />
                  <SelectField label="Format" value={n.format || "other"} onChange={(v) => setNote(i, { format: v as AdNote["format"] })} options={[{ value: "picture", label: "Picture" }, { value: "video", label: "Video" }, { value: "carousel", label: "Carousel" }, { value: "other", label: "Other / not sure" }]} />
                  <TextField label="Started running on" value={n.since} onChange={(v) => setNote(i, { since: v })} placeholder="As the Library shows it" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.notes.length < 5 && <button type="button" className={secondaryBtn} onClick={() => setS((x) => ({ ...x, notes: [...x.notes, { ...BLANK }] }))}>Add another ad</button>}
            {s.notes.length > 1 && <button type="button" className={secondaryBtn} onClick={() => setS((x) => ({ ...x, notes: x.notes.slice(0, -1) }))}>Remove the last</button>}
          </div>
        </Panel>
        <div className="space-y-5">
          <ResultPanel title="3. Ideas to test — your own, not copies">
            {hyps.length ? (
              <ul className="space-y-2 text-[13.5px] leading-relaxed text-white/85">{hyps.map((h) => <li key={h} className="rounded-lg bg-paper/50 px-3 py-2">{h}</li>)}</ul>
            ) : (
              <p className="text-[13.5px] text-white/70">Add notes on at least one ad to see test ideas.</p>
            )}
            <div className="mt-4">
              <p className="text-[13px] font-medium text-white">What the Ad Library can&rsquo;t tell you</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-white/65">{CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton text={text} label="Copy notes" />
              <DownloadButton text={text} filename="ad-library-notes.txt" label="Download notes" />
            </div>
          </ResultPanel>
          {hyps.length > 0 && (
            <NextStep title="Turn an idea into a test" body="Your free MAIRO plan picks the first test for your business and keeps it to one change at a time." action="Use these ideas in my plan" handoff={{ kind: "note", tool: "competitor-ads", label: "Test ideas from Ad Library research", text: hyps.join("\n") }} />
          )}
        </div>
      </div>
    </div>
  );
}
