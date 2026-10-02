"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { brainChangeAction } from "@/lib/actions/brain-actions";
import { answerBusinessQuestionAction } from "@/lib/actions/campaign-wizard-actions";
import { toggleLearningAction } from "@/lib/actions/report-actions";
import type { FactChange } from "@/lib/brain/edit";
import { Drawer } from "@/components/mairo/overlay";
import { actionClass, quietClass } from "@/components/mairo/action-styles";

// The Business Brain page's interactive parts. Every change is the owner's
// own word — confirmed, and never overwritten by anything MAIRO infers later.

export type FactRowData = {
  key: string;
  label: string;
  list: boolean;
  value: string | string[];
  source: string;
  inferred: boolean;
  purpose: string;
};

const input = "w-full rounded-xl border border-[color:var(--mairo-line)] bg-[rgba(10,16,32,0.6)] px-3.5 py-2.5 text-[14px] text-white placeholder-faint outline-none focus:border-[color:var(--mairo-line-lit)]";
const small = "rounded-full border border-[color:var(--mairo-line)] px-3 py-1 text-[12px] text-white/85 transition hover:border-[color:var(--mairo-line-lit)] hover:text-white disabled:opacity-50";

function useChange() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (change: FactChange, after?: () => void) =>
    start(async () => {
      const r = await brainChangeAction(change).catch(() => ({ ok: false as const, error: "Couldn't save that just now." }));
      setNote(r.ok ? { ok: true, text: r.changed ? "✓ MAIRO learned this." : r.text } : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { run, pending, note };
}

/** One thing MAIRO believes, with where it came from and Correct · Update · Remove. */
export function FactRow({ fact }: { fact: FactRowData }) {
  const { run, pending, note } = useChange();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const values = Array.isArray(fact.value) ? fact.value : [fact.value];
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-muted">{fact.label}</p>
          {fact.list ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {values.map((v) => (
                <li key={v} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pl-3 pr-1.5 text-[13.5px] text-white">
                  {v}
                  <button type="button" disabled={pending} aria-label={`Remove ${v}`} onClick={() => run({ op: "remove", field: fact.key, value: v })}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">×</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-[15px] leading-relaxed text-white">{values[0]}</p>
          )}
          <p className="mt-1.5 text-[11.5px] text-faint">
            {fact.inferred ? <span className="text-amber-200/80">MAIRO&rsquo;s best guess · </span> : null}
            {fact.source}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {fact.inferred && <button type="button" disabled={pending} onClick={() => run({ op: "confirm", field: fact.key })} className={small}>Correct</button>}
            <button type="button" onClick={() => { setText(fact.list ? "" : values[0]); setEditing(true); }} className={small}>{fact.list ? "Add" : "Update"}</button>
            {!fact.list && <button type="button" disabled={pending} onClick={() => run({ op: "remove", field: fact.key })} className={small}>Remove</button>}
          </div>
        )}
      </div>
      {editing && (
        <form className="mt-2.5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run({ op: fact.list ? "add" : "set", field: fact.key, value: text }, () => setEditing(false)); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label={fact.label} className={input} autoFocus />
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !text.trim()} className={actionClass}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditing(false)} className={quietClass}>Cancel</button>
          </div>
        </form>
      )}
      {note && <p className={`mt-1.5 text-[12px] ${note.ok ? "text-emerald-300" : "text-amber-200/90"}`}>{note.text}</p>}
    </li>
  );
}

/** "+ Add something": the facts this section doesn't have yet, each with why MAIRO would use it. */
export function AddFact({ missing }: { missing: { key: string; label: string; list: boolean; purpose: string }[] }) {
  const { run, pending, note } = useChange();
  const [key, setKey] = useState("");
  const [text, setText] = useState("");
  if (missing.length === 0) return null;
  const def = missing.find((m) => m.key === key);
  return (
    <div className="pt-3">
      {!key ? (
        <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          <span>+ Tell MAIRO about</span>
          <select value="" onChange={(e) => setKey(e.target.value)} aria-label="Add something MAIRO doesn't know yet"
            className="rounded-full border border-[color:var(--mairo-line)] bg-[rgba(10,16,32,0.6)] px-3 py-1 text-[12.5px] text-white">
            <option value="">choose…</option>
            {missing.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); run({ op: def!.list ? "add" : "set", field: key, value: text }, () => { setKey(""); setText(""); }); }}>
          <p className="text-[13px] text-white">{def!.label}</p>
          <p className="text-[11.5px] text-faint">Why MAIRO keeps this: {def!.purpose}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label={def!.label} className={input} autoFocus />
            <div className="flex gap-2">
              <button type="submit" disabled={pending || !text.trim()} className={actionClass}>{pending ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setKey("")} className={quietClass}>Cancel</button>
            </div>
          </div>
        </form>
      )}
      {note && <p className={`mt-1.5 text-[12px] ${note.ok ? "text-emerald-300" : "text-amber-200/90"}`}>{note.text}</p>}
    </div>
  );
}

export type ProductData = {
  name: string;
  price: string | null;
  kind: string | null;
  priority: string | null;
  profitability: string | null;
  status: string | null;
  goal: string | null;
};

/** A product or service record: priority, profitability, availability — each only as the owner says. */
export function ProductCard({ product: p }: { product: ProductData }) {
  const { run, pending, note } = useChange();
  const patch = (x: Partial<ProductData>) => run({ op: "product", name: p.name, patch: x as never });
  const chip = (on: boolean) => `${small} ${on ? "border-[color:var(--mairo-line-lit)] bg-violet/[0.15] text-white" : ""}`;
  return (
    <li className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-white">{p.name}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {[p.price, p.kind === "service" ? "Service" : p.kind === "product" ? "Product" : null, p.goal ? `Goal: ${p.goal}` : null].filter(Boolean).join(" · ") || "No details yet"}
          </p>
        </div>
        {p.status === "unavailable" ? (
          <span className="rounded-full bg-amber-300/10 px-2.5 py-0.5 text-[11.5px] text-amber-200">Unavailable</span>
        ) : p.status === "new" || p.status === "seasonal" ? (
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11.5px] text-white/80">{p.status === "new" ? "New" : "Seasonal"}</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" disabled={pending} aria-pressed={p.priority === "high"} onClick={() => patch({ priority: p.priority === "high" ? "normal" : "high" })} className={chip(p.priority === "high")}>
          {p.priority === "high" ? "★ Priority" : "Make a priority"}
        </button>
        <button type="button" disabled={pending} aria-pressed={p.profitability === "high"} onClick={() => patch({ profitability: p.profitability === "high" ? "normal" : "high" })} className={chip(p.profitability === "high")}>
          {p.profitability === "high" ? "$ High margin" : "High margin?"}
        </button>
        <button type="button" disabled={pending} onClick={() => patch({ status: p.status === "unavailable" ? "available" : "unavailable" })} className={small}>
          {p.status === "unavailable" ? "Available again" : "Mark unavailable"}
        </button>
        <button type="button" disabled={pending} onClick={() => run({ op: "remove-product", name: p.name })} className={small}>Remove</button>
      </div>
      {note && <p className={`mt-1.5 text-[12px] ${note.ok ? "text-emerald-300" : "text-amber-200/90"}`}>{note.text}</p>}
    </li>
  );
}

export function AddProduct() {
  const { run, pending, note } = useChange();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [kind, setKind] = useState<"product" | "service">("product");
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[12.5px] text-violet-bright hover:text-white">+ Add a product or service</button>;
  return (
    <form className="mt-3 rounded-2xl border border-[color:var(--mairo-line)] p-4" onSubmit={(e) => { e.preventDefault(); run({ op: "product", name, patch: { kind, price: price.trim() || null } }, () => { setOpen(false); setName(""); setPrice(""); }); }}>
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_150px]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Ceramic coating" aria-label="Product or service name" className={input} autoFocus />
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (optional)" aria-label="Price" className={input} />
        <select value={kind} onChange={(e) => setKind(e.target.value as "product" | "service")} aria-label="Product or service" className={input}>
          <option value="product">Product</option>
          <option value="service">Service</option>
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending || !name.trim()} className={actionClass}>{pending ? "Saving…" : "Add"}</button>
        <button type="button" onClick={() => setOpen(false)} className={quietClass}>Cancel</button>
      </div>
      {note && <p className={`mt-1.5 text-[12px] ${note.ok ? "text-emerald-300" : "text-amber-200/90"}`}>{note.text}</p>}
    </form>
  );
}

/** "Is Ceramic Coating still your highest-priority service?" — Yes / Change. Only for stale or conflicting facts. */
export function VerifyFact({ field, question, list }: { field: string; question: string; list: boolean }) {
  const { run, pending, note } = useChange();
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState("");
  return (
    <section className="rounded-2xl border p-5" style={{ borderColor: "rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.05)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Quick check</p>
      <p className="mt-2 text-[15px] text-white">{question}</p>
      {!changing ? (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={pending} onClick={() => run({ op: "confirm", field })} className={actionClass}>Yes</button>
          <button type="button" onClick={() => setChanging(true)} className={quietClass}>Change</button>
        </div>
      ) : (
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run({ op: "set", field, value: text }); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="What it is now" placeholder={list ? "What it is now" : "What it is now"} className={input} autoFocus />
          <button type="submit" disabled={pending || !text.trim()} className={actionClass}>Save</button>
        </form>
      )}
      {note && <p className={`mt-2 text-[12px] ${note.ok ? "text-emerald-300" : "text-amber-200/90"}`}>{note.text}</p>}
    </section>
  );
}

export type QuestionData = { id: string; text: string; why: string; placeholder: string | null; yesNo: boolean; choices: string[] | null };

/** A question MAIRO would use — with why it's asking. The answer is saved to the Business Brain. */
export function BrainQuestion({ q }: { q: QuestionData }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const send = (answer: string) =>
    start(async () => {
      const r = await answerBusinessQuestionAction({ id: q.id, answer }).catch(() => ({ ok: false as const, error: "Couldn't save that just now." }));
      setState(r.ok ? { ok: true, text: r.saved === "declined" ? "✓ Noted — MAIRO won't ask again." : "✓ MAIRO learned this." } : { ok: false, text: r.error });
      if (r.ok) setTimeout(() => router.refresh(), 900);
    });
  return (
    <div className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
      <p className="text-[14.5px] text-white">{q.text}</p>
      <p className="mt-1 text-[12px] text-faint"><span className="text-white/70">Why MAIRO is asking: </span>{q.why}</p>
      {state ? (
        <p className={`mt-3 text-[13px] ${state.ok ? "text-emerald-300" : "text-amber-200/90"}`}>{state.text}</p>
      ) : q.choices ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {q.choices.map((c) => {
              const on = picked.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setPicked((x) => (on ? x.filter((y) => y !== c) : [...x, c]))}
                  className={`${small} ${on ? "border-[color:var(--mairo-line-lit)] bg-violet/[0.15] text-white" : ""}`}>{on ? "✓ " : ""}{c}</button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending || !picked.length} onClick={() => send(picked.join("; "))} className={actionClass}>Save</button>
            <button type="button" disabled={pending} onClick={() => send("none")} className="px-2 text-[12.5px] text-muted hover:text-white">None of these</button>
          </div>
        </div>
      ) : q.yesNo ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add detail (optional)" aria-label={q.text} className={input} />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => send(`yes ${text}`)} className={actionClass}>Yes</button>
            <button type="button" disabled={pending} onClick={() => send("no")} className={quietClass}>No</button>
          </div>
        </div>
      ) : (
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={q.placeholder ?? "In your own words"} aria-label={q.text} className={input} />
          <button type="submit" disabled={pending || !text.trim()} className={actionClass}>{pending ? "Saving…" : "Save"}</button>
        </form>
      )}
    </div>
  );
}

export type InsightData = {
  id: string;
  said: string;
  mark: string;
  confidence: string;
  detail: string;
  evidence: { label: string; value: string }[];
  goal: string | null;
  sampleSize: number | null;
  discovered: string;
  validated: string;
  active: boolean;
};

/** 🔥 / 💡 a learned insight; the evidence opens in a drawer, and the owner can switch it off. */
export function InsightRow({ i }: { i: InsightData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const level = i.confidence === "HIGH" ? "High confidence" : i.confidence === "MEDIUM" ? "Medium confidence" : "Low confidence — still learning";
  return (
    <li className={`flex items-start justify-between gap-3 py-3 ${i.active ? "" : "opacity-50"}`}>
      <p className="min-w-0 text-[14.5px] leading-relaxed text-white">
        <span aria-hidden className="mr-1.5">{i.mark}</span>
        {i.said}
      </p>
      <button type="button" onClick={() => setOpen(true)} className={`${small} shrink-0`}>See why</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="What MAIRO learned">
        <p className="text-[15px] text-white">{i.said}</p>
        {i.detail && <p className="mt-2 text-[13.5px] leading-relaxed text-white/80">{i.detail}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-2.5 text-[13px]">
          <div className="rounded-xl bg-white/[0.04] px-3.5 py-2.5"><dt className="text-[11.5px] text-muted">Confidence</dt><dd className="mt-0.5 text-white">{level}</dd></div>
          <div className="rounded-xl bg-white/[0.04] px-3.5 py-2.5"><dt className="text-[11.5px] text-muted">Based on</dt><dd className="mt-0.5 text-white">{i.sampleSize ? `${i.sampleSize} compared` : "Recent results"}</dd></div>
          <div className="rounded-xl bg-white/[0.04] px-3.5 py-2.5"><dt className="text-[11.5px] text-muted">First noticed</dt><dd className="mt-0.5 text-white">{i.discovered}</dd></div>
          <div className="rounded-xl bg-white/[0.04] px-3.5 py-2.5"><dt className="text-[11.5px] text-muted">Last seen again</dt><dd className="mt-0.5 text-white">{i.validated}</dd></div>
        </dl>
        {i.goal && <p className="mt-3 text-[12.5px] text-muted">Learned while your goal was: {i.goal}</p>}
        {i.evidence.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-[13px]">
            {i.evidence.map((e, k) => <li key={k} className="flex justify-between gap-3"><span className="text-muted">{e.label}</span><span className="text-white">{e.value}</span></li>)}
          </ul>
        )}
        <p className="mt-4 text-[12px] leading-relaxed text-faint">This describes what happened in your campaigns — not a guarantee of what will happen next.</p>
        <button type="button" disabled={pending} onClick={() => start(async () => { await toggleLearningAction(i.id, !i.active); router.refresh(); setOpen(false); })} className={`${quietClass} mt-4`}>
          {i.active ? "Stop using this" : "Use this again"}
        </button>
      </Drawer>
    </li>
  );
}
