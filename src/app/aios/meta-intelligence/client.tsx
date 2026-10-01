"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import {
  addSourceAction,
  analyzeUpdateAction,
  checkSourceNowAction,
  createFlagAction,
  discoverAccountAction,
  editFeatureAction,
  ingestOfficialTextAction,
  markAlertsReadAction,
  moveUpdateAction,
  recordManualTestAction,
  runContractTestsAction,
  runSandboxAction,
  setFlagStageAction,
  setupMetaIntelligenceAction,
  toggleSourceAction,
  validateFeatureAction,
} from "@/lib/actions/meta-intelligence-actions";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (fn: () => Promise<Result>) =>
    start(async () => {
      setMsg(null);
      const r = await fn().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong." }));
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      router.refresh();
    });
  const note = msg ? <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-[12.5px] ${msg.ok ? "text-emerald-300" : "text-alert"}`}>{msg.text}</p> : null;
  return { pending, act, note };
}

const small = "rounded-full border border-[color:var(--mairo-line)] px-3 py-1.5 text-[12.5px] text-white/85 hover:text-white disabled:opacity-50";

export function ActButton({ label, run, primary = false }: { label: string; run: "setup" | "contract" | "alerts-read" | { analyze: string } | { check: string } | { flag: string } | { discover: string } | { toggleSource: string; active: boolean }; primary?: boolean }) {
  const { pending, act, note } = useAct();
  const fn = (): Promise<Result> => {
    if (run === "setup") return setupMetaIntelligenceAction();
    if (run === "contract") return runContractTestsAction();
    if (run === "alerts-read") return markAlertsReadAction();
    if ("analyze" in run) return analyzeUpdateAction(run.analyze);
    if ("check" in run) return checkSourceNowAction(run.check);
    if ("flag" in run) return createFlagAction(run.flag);
    if ("discover" in run) return discoverAccountAction(run.discover);
    return toggleSourceAction(run.toggleSource, run.active);
  };
  return (
    <span className="inline-block">
      <button type="button" disabled={pending} onClick={() => act(fn)} className={primary ? primaryButtonClass : small}>{pending ? "Working…" : label}</button>
      {note}
    </span>
  );
}

export function MoveUpdate({ id, next, stages }: { id: string; next: string | null; stages: { value: string; label: string }[] }) {
  const { pending, act, note } = useAct();
  const [to, setTo] = useState(next ?? stages[0]?.value ?? "");
  const [why, setWhy] = useState("");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`to-${id}`}>Move to</label>
        <select id={`to-${id}`} value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} w-auto`}>
          {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Note for the record (optional)" className={`${inputClass} min-w-[220px] flex-1`} aria-label="Note" />
        <button type="button" disabled={pending || !to} onClick={() => act(() => moveUpdateAction(id, to, why))} className={primaryButtonClass}>{pending ? "Moving…" : "Move"}</button>
      </div>
      {note}
    </div>
  );
}

export function SandboxForm({ configured, updateId }: { configured: boolean; updateId?: string }) {
  const { pending, act, note } = useAct();
  const [version, setVersion] = useState("");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Candidate version (optional), e.g. v25.0" className={`${inputClass} w-[260px]`} aria-label="Candidate API version" />
        <button type="button" disabled={pending || !configured} onClick={() => act(() => runSandboxAction(version, updateId))} className={secondaryButtonClass}>{pending ? "Running…" : "Run sandbox tests"}</button>
      </div>
      {!configured && <p className="mt-1 text-[12px] text-faint">Set META_SANDBOX_ACCESS_TOKEN and META_SANDBOX_AD_ACCOUNT_ID (a Meta test/sandbox ad account — never a customer&rsquo;s) to enable live tests.</p>}
      {note}
    </div>
  );
}

export function ManualTestForm({ updateId }: { updateId?: string }) {
  const { pending, act, note } = useAct();
  const [notes, setNotes] = useState("");
  const [passed, setPassed] = useState(true);
  return (
    <div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="What you tested on which test account, and what happened" aria-label="Test notes" />
      <div className="mt-2 flex items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-white/85"><input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} /> Passed</label>
        <button type="button" disabled={pending} onClick={() => act(() => recordManualTestAction({ passed, notes, updateId }))} className={secondaryButtonClass}>{pending ? "Saving…" : "Record test-account check"}</button>
      </div>
      {note}
    </div>
  );
}

export function FlagForm({ flagKey, stage, internal, selected, stages }: { flagKey: string; stage: string; internal: string[]; selected: string[]; stages: { value: string; label: string }[] }) {
  const { pending, act, note } = useAct();
  const [s, setS] = useState(stage);
  const [i, setI] = useState(internal.join(", "));
  const [sel, setSel] = useState(selected.join(", "));
  return (
    <div>
      <div className="grid gap-2 md:grid-cols-[180px_1fr_1fr_auto]">
        <select value={s} onChange={(e) => setS(e.target.value)} className={inputClass} aria-label={`${flagKey} stage`}>
          {stages.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
        <input value={i} onChange={(e) => setI(e.target.value)} className={inputClass} placeholder="Internal org ids" aria-label="Internal org ids" />
        <input value={sel} onChange={(e) => setSel(e.target.value)} className={inputClass} placeholder="Selected org ids" aria-label="Selected org ids" />
        <button type="button" disabled={pending} onClick={() => act(() => setFlagStageAction(flagKey, s, i, sel))} className={secondaryButtonClass}>{pending ? "Saving…" : "Save"}</button>
      </div>
      {note}
    </div>
  );
}

export function FeatureEditForm({ featureKey, initial }: { featureKey: string; initial: { availability: string; regionRestrictions: string[]; deprecated: boolean; deprecationDate: string; replacementKey: string; notes: string; support: string } }) {
  const { pending, act, note } = useAct();
  const [f, setF] = useState({ ...initial, regionRestrictions: initial.regionRestrictions.join(", ") });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-[12px] text-faint">Availability
          <select value={f.availability} onChange={set("availability")} className={inputClass}>{["GA", "LIMITED", "BETA", "ALPHA", "UNKNOWN"].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="text-[12px] text-faint">MAIRO support
          <select value={f.support} onChange={set("support")} className={inputClass}>{["SUPPORTED", "PARTIALLY_SUPPORTED", "TESTING", "NOT_SUPPORTED", "DEPRECATED", "NOT_APPLICABLE"].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="text-[12px] text-faint">Regions (ISO codes)
          <input value={f.regionRestrictions} onChange={set("regionRestrictions")} className={inputClass} placeholder="US, CA" />
        </label>
        <label className="text-[12px] text-faint">Deprecation date
          <input value={f.deprecationDate} onChange={set("deprecationDate")} className={inputClass} placeholder="YYYY-MM-DD" />
        </label>
        <label className="text-[12px] text-faint">Replacement feature key
          <input value={f.replacementKey} onChange={set("replacementKey")} className={inputClass} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-[13px] text-white/85"><input type="checkbox" checked={f.deprecated} onChange={set("deprecated")} /> Deprecated (new campaigns stop using it)</label>
      </div>
      <textarea value={f.notes} onChange={set("notes")} rows={2} className={inputClass} placeholder="Notes" aria-label="Notes" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => act(() => editFeatureAction(featureKey, f))} className={secondaryButtonClass}>{pending ? "Saving…" : "Save record"}</button>
        <button type="button" disabled={pending} onClick={() => act(() => validateFeatureAction(featureKey, "SUPPORTED"))} className={secondaryButtonClass}>Validate as supported</button>
        <button type="button" disabled={pending} onClick={() => act(() => validateFeatureAction(featureKey, "PARTIALLY_SUPPORTED"))} className={secondaryButtonClass}>Validate as partially supported</button>
      </div>
      {note}
    </div>
  );
}

export function SourceForms({ sources }: { sources: { id: string; name: string }[] }) {
  const add = useAct();
  const paste = useAct();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("DOCS");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [text, setText] = useState("");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-[14px] font-medium text-white">Add a source</h3>
        <p className="mt-0.5 text-[12px] text-faint">https pages on Meta&rsquo;s own sites only. Authority comes from the host.</p>
        <div className="mt-2 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Name" aria-label="Source name" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://developers.facebook.com/docs/…" aria-label="Source URL" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass} aria-label="Kind">{["CHANGELOG", "VERSIONS", "DOCS", "HELP_CENTER", "ANNOUNCEMENTS"].map((k) => <option key={k}>{k}</option>)}</select>
          <button type="button" disabled={add.pending} onClick={() => add.act(() => addSourceAction({ name, url, kind: kind as never }))} className={secondaryButtonClass}>Add source</button>
          {add.note}
        </div>
      </div>
      <div>
        <h3 className="text-[14px] font-medium text-white">Paste official text</h3>
        <p className="mt-0.5 text-[12px] text-faint">When a page can&rsquo;t be fetched. Compared with the stored version like a fetch.</p>
        <div className="mt-2 space-y-2">
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass} aria-label="Source">{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={inputClass} placeholder="The page's text" aria-label="Official text" />
          <button type="button" disabled={paste.pending} onClick={() => paste.act(() => ingestOfficialTextAction(sourceId, text))} className={secondaryButtonClass}>Compare and file changes</button>
          {paste.note}
        </div>
      </div>
    </div>
  );
}
