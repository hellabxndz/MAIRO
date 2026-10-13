"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionClass, quietClass } from "@/components/mairo/action-styles";
import { addLeadAction, importLeadsAction, previewLeadImportAction } from "@/lib/actions/lead-actions";
import { LEAD_OUTCOMES } from "@/lib/leads/outcomes";
import { MAX_BYTES, previewImport, type ImportPreview } from "@/lib/leads/import";
import type { ImportSummary } from "@/lib/leads/history";

// Leads that didn't come through a form: one typed in (a call, a walk-in, an
// email), or a spreadsheet of the ones the business already has. Both are
// the owner's to follow up; neither is counted as a result of advertising.
//
// The spreadsheet is read in the browser first to show what would happen —
// which rows are ready, which are refused and why, who appears twice — then
// the server checks it all again before anything is saved.

const field = "w-full rounded-lg border border-[color:var(--mairo-line)] bg-transparent px-3 py-2 text-[13.5px] text-white";
const FIELD_LABEL: Record<string, string> = { name: "Name", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", status: "Status", value: "Value", date: "Date", notes: "Notes" };

export function LeadIntake() {
  const [open, setOpen] = useState<"add" | "import" | null>(null);
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-expanded={open === "add"} onClick={() => setOpen(open === "add" ? null : "add")} className={quietClass}>+ Add a lead</button>
        <button type="button" aria-expanded={open === "import"} onClick={() => setOpen(open === "import" ? null : "import")} className={quietClass}>Import from a spreadsheet</button>
      </div>
      {open === "add" && <AddLead onDone={() => setOpen(null)} />}
      {open === "import" && <ImportLeads />}
    </div>
  );
}

function AddLead({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ name: "", email: "", phone: "", status: "NEW", valueDollars: "", notes: "", receivedOn: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  return (
    <form
      className="mt-3 rounded-2xl border p-4"
      style={{ borderColor: "var(--mairo-line)" }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await addLeadAction(v);
          if (!r.ok) return setError(r.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <p className="text-[14px] font-medium text-white">Add a lead</p>
      <p className="mt-0.5 text-[12.5px] text-muted">Someone who called, walked in or emailed. You&apos;ll follow them up here like any other lead; they&apos;re not counted as a result of your ads.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[12.5px] text-muted">Name<input className={`${field} mt-1`} value={v.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} autoComplete="off" /></label>
        <label className="text-[12.5px] text-muted">Email<input className={`${field} mt-1`} type="email" value={v.email} maxLength={200} onChange={(e) => set({ email: e.target.value })} autoComplete="off" /></label>
        <label className="text-[12.5px] text-muted">Phone<input className={`${field} mt-1`} type="tel" value={v.phone} maxLength={40} onChange={(e) => set({ phone: e.target.value })} autoComplete="off" /></label>
        <label className="text-[12.5px] text-muted">When they got in touch<input className={`${field} mt-1`} type="date" value={v.receivedOn} onChange={(e) => set({ receivedOn: e.target.value })} /></label>
        <label className="text-[12.5px] text-muted">Where it&apos;s at
          <select className={`${field} mt-1 bg-[color:var(--mairo-bg)]`} value={v.status} onChange={(e) => set({ status: e.target.value })}>
            {LEAD_OUTCOMES.map((o) => <option key={o.status} value={o.status}>{o.label}</option>)}
          </select>
        </label>
        {v.status === "WON" && <label className="text-[12.5px] text-muted">What the job was worth ($)<input className={`${field} mt-1`} inputMode="decimal" value={v.valueDollars} onChange={(e) => set({ valueDollars: e.target.value })} /></label>}
        <label className="text-[12.5px] text-muted sm:col-span-2">Notes<textarea className={`${field} mt-1`} rows={2} maxLength={2000} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>
      <p className="mt-2 text-[11.5px] text-faint">An email or a phone number is needed, so you can reach them and MAIRO can tell if they&apos;re already a lead.</p>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-warn">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className={`${actionClass} disabled:opacity-50`}>{pending ? "Saving…" : "Add lead"}</button>
        <button type="button" onClick={onDone} className={quietClass}>Cancel</button>
      </div>
    </form>
  );
}

function ImportLeads() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function choose(f: File) {
    setError(null);
    setResult(null);
    setPreview(null);
    if (f.size > MAX_BYTES) return setError("That file is over 1MB. Split it and import the parts one at a time.");
    const text = await f.text();
    setFile({ name: f.name, text });
    // The browser's reading, then the server's — the second is what counts.
    setPreview(previewImport(text));
    const server = await previewLeadImportAction(text);
    if ("error" in server) setError(server.error);
    else setPreview(server);
  }

  return (
    <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
      <p className="text-[14px] font-medium text-white">Import from a spreadsheet</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
        A CSV with a header row. MAIRO reads columns called Name (or First name and Last name), Email, Phone, Status, Value, Date and Notes. Each row needs an email or a phone. Dates as YYYY-MM-DD. Up to 2,000 rows. Imported leads are yours to follow up; they&apos;re never counted as results of your ads.
      </p>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void choose(f);
        }} />
      <button type="button" onClick={() => input.current?.click()} className={`${quietClass} mt-3`}>{file ? `Choose another file (now: ${file.name})` : "Choose a CSV file"}</button>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-warn">{error}</p>}

      {preview && !result && (
        <div className="mt-4 space-y-3" aria-live="polite">
          {preview.problems.length > 0 ? (
            preview.problems.map((p) => <p key={p} role="alert" className="text-[13px] text-warn">{p}</p>)
          ) : (
            <>
              <p className="text-[13.5px] text-white">
                {preview.rows} row{preview.rows === 1 ? "" : "s"}: <strong>{preview.ready}</strong> ready to import
                {preview.duplicatesInFile > 0 && <>, {preview.duplicatesInFile} the same person as an earlier row (merged into it)</>}
                {preview.refused.length > 0 && <>, <span className="text-warn">{preview.refused.length} can&apos;t be imported</span></>}.
              </p>
              <p className="text-[12px] text-muted">Reading: {preview.columns.map((c) => `${c.header} → ${FIELD_LABEL[c.field]}`).join(" · ")}{preview.unused.length ? `. Not used: ${preview.unused.join(", ")}` : ""}.</p>
              <p className="text-[12px] text-muted">Anyone already in your leads (same email or phone) is updated, not added twice — a later stage moves them on, and a stage you set in MAIRO is never moved backwards.</p>
              {preview.refused.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[12.5px] text-warn">Rows that can&apos;t be imported ({preview.refused.length})</summary>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[12.5px] text-white/80">
                    {preview.refused.slice(0, 100).map((r) => <li key={r.line}>Row {r.line}: {r.problems.join(" ")}</li>)}
                  </ul>
                </details>
              )}
              <button
                type="button"
                disabled={pending || preview.ready + preview.duplicatesInFile === 0 || !file}
                onClick={() =>
                  start(async () => {
                    if (!file) return;
                    const r = await importLeadsAction(file.text, file.name);
                    setResult(r);
                    if (r.ok) router.refresh();
                  })
                }
                className={`${actionClass} disabled:opacity-50`}
              >
                {pending ? "Importing…" : `Import ${preview.ready} lead${preview.ready === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <div role="status" className="mt-4 text-[13px]">
          {result.ok ? (
            <p className="text-live">
              Imported {result.created} new lead{result.created === 1 ? "" : "s"}
              {result.merged > 0 && <>; {result.merged} matched someone already in your leads{result.mergedChanged > 0 ? ` (${result.mergedChanged} updated)` : ""}</>}
              {result.kept > 0 && <>; kept your MAIRO stage for {result.kept}</>}
              {result.refused.length > 0 && <>; {result.refused.length} row{result.refused.length === 1 ? "" : "s"} skipped</>}. Every change is in each lead&apos;s history.
            </p>
          ) : (
            <p className="text-warn">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
