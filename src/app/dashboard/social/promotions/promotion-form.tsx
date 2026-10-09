"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPromotionAction, endPromotionAction, type ManagerResult } from "@/lib/actions/social-manager-actions";
import { PROMOTION_FIELDS, PROMOTION_KINDS, SEQUENCES, type PromotionKind } from "@/lib/social/goals";

const input = "w-full rounded-lg border border-white/10 bg-field-2 px-3 py-2 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60";

export function PromotionForm({ initialKind }: { initialKind: PromotionKind | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<PromotionKind | "NONE" | null>(initialKind);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ManagerResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
      <h2 className="text-[18px] font-semibold text-white">Anything happening at your business?</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROMOTION_KINDS.map((k) => (
          <button key={k.key} type="button" onClick={() => { setKind(k.key); setDetails({}); setResult(null); }}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${kind === k.key ? "bg-[#7c5cff] text-white" : "border border-white/12 text-white/85 hover:border-white/30"}`}>
            {k.label}
          </button>
        ))}
        <button type="button" onClick={() => { setKind("NONE"); setResult(null); }}
          className={`rounded-full px-3.5 py-1.5 text-[13px] ${kind === "NONE" ? "bg-white/10 text-white" : "border border-white/12 text-white/60"}`}>
          Nothing right now
        </button>
      </div>

      {kind === "NONE" && <p className="mt-4 text-[13.5px] text-muted">No problem. MAIRO keeps planning around your goal. Come back when something&rsquo;s coming up.</p>}

      {kind && kind !== "NONE" && (
        <div className="mt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {PROMOTION_FIELDS[kind].map((f) => (
              <label key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                <span className="text-[13px] text-white/85">{f.label}{f.required ? " *" : ""}</span>
                {f.type === "textarea" ? (
                  <textarea rows={2} value={details[f.key] ?? ""} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} className={`${input} mt-1`} placeholder={f.placeholder} />
                ) : (
                  <input type={f.type === "date" ? "date" : "text"} value={details[f.key] ?? ""} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} className={`${input} mt-1`} placeholder={f.placeholder} />
                )}
              </label>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] text-muted">
            MAIRO&rsquo;s plan: {SEQUENCES[kind].map((s) => s.step).join(" → ")}, with useful posts in between. Steps that would land in the past are left out.
          </p>
          <button type="button" disabled={pending} className="mt-4 min-h-[44px] rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            onClick={() => start(async () => {
              setResult(null);
              const r = await addPromotionAction({ kind, details }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
              setResult(r);
              if (r.ok) { setDetails({}); setKind(null); router.refresh(); }
            })}>
            {pending ? "MAIRO is planning it…" : "Let MAIRO market this"}
          </button>
        </div>
      )}
      {result && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${result.ok ? "bg-emerald-400/10 text-emerald-300" : "bg-alert/10 text-alert"}`}>{result.ok ? result.message : result.error}</p>}
    </section>
  );
}

export function EndPromotion({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button type="button" onClick={() => setConfirm(true)} className="rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] text-white/80 hover:border-white/30">Stop promotion</button>;
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-white/80">
      Skip its posts that haven&rsquo;t gone out?
      <button type="button" disabled={pending} onClick={() => start(async () => { await endPromotionAction(id).catch(() => null); router.refresh(); })} className="rounded-lg bg-red-500/80 px-3 py-1.5 text-white">Stop</button>
      <button type="button" onClick={() => setConfirm(false)} className="rounded-lg border border-white/12 px-3 py-1.5">Keep</button>
    </span>
  );
}
