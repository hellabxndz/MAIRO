"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveWeekAction, planAction, resumeSocialAction, setApprovalModeAction, updateSocialSettingsAction, type ManagerResult } from "@/lib/actions/social-manager-actions";
import { APPROVAL_MODES, type ApprovalMode, type GoalKey } from "@/lib/social/goals";
import type { Network } from "@/lib/instagram/social-logic";
import { GoalSetup } from "./goal-setup";

// The interactive parts of the Social Manager overview.

const primary = "min-h-[42px] rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-50";
const secondary = "min-h-[42px] rounded-lg border border-white/12 px-4 text-[13.5px] text-white/85 transition hover:border-white/30 disabled:opacity-50";

function Note({ r }: { r: ManagerResult | null }) {
  if (!r) return null;
  return <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-400/10 text-emerald-300" : "bg-alert/10 text-alert"}`}>{r.ok ? r.message : r.error}</p>;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ManagerResult | null>(null);
  const run = (fn: () => Promise<ManagerResult>) => {
    setResult(null);
    start(async () => {
      const r = await fn().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
      setResult(r);
      if (r.ok) router.refresh();
    });
  };
  return { pending, result, setResult, run, start, router };
}

export function ChangeGoal({ current, businessName }: { current: { goal: GoalKey; goalDetail: string; platforms: Network[]; postsPerWeek: number }; businessName: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <div className="mt-4"><GoalSetup initial={current} businessName={businessName} onCancel={() => setOpen(false)} /></div>;
  return <button type="button" onClick={() => setOpen(true)} className={secondary}>Change goal</button>;
}

export function ApprovalModePicker({ mode, approvedSoFar, minForAutopilot }: { mode: ApprovalMode; approvedSoFar: number; minForAutopilot: number }) {
  const { pending, result, run } = useRun();
  return (
    <div>
      <div role="radiogroup" aria-label="How posts are approved" className="grid gap-2 md:grid-cols-3">
        {APPROVAL_MODES.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} disabled={pending}
            onClick={() => m.key !== mode && run(() => setApprovalModeAction(m.key))}
            className={`rounded-xl border p-3.5 text-left transition disabled:opacity-60 ${mode === m.key ? "border-violet-400 bg-violet/[0.14]" : "border-white/10 hover:border-white/25"}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium text-white">{m.label}</span>
              {m.key === "APPROVAL_REQUIRED" && <span className="text-[11px] text-faint">Default</span>}
            </span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{m.text}</span>
            {m.key === "AUTOPILOT" && approvedSoFar < minForAutopilot && (
              <span className="mt-1.5 block text-[11.5px] text-amber-200/90">Unlocks after you approve {minForAutopilot} posts yourself ({approvedSoFar} so far).</span>
            )}
          </button>
        ))}
      </div>
      <Note r={result} />
    </div>
  );
}

export function PostingSettings({ platforms, postsPerWeek }: { platforms: Network[]; postsPerWeek: number }) {
  const { pending, result, run } = useRun();
  const [p, setP] = useState(platforms);
  const [n, setN] = useState(postsPerWeek);
  const dirty = n !== postsPerWeek || p.slice().sort().join() !== platforms.slice().sort().join();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-white/90">
      {(["INSTAGRAM", "FACEBOOK"] as Network[]).map((net) => (
        <label key={net} className="flex items-center gap-2">
          <input type="checkbox" checked={p.includes(net)} onChange={() => setP((x) => (x.includes(net) ? x.filter((y) => y !== net) : [...x, net]))} className="h-4 w-4 accent-[#7c5cff]" />
          {net === "INSTAGRAM" ? "Instagram" : "Facebook Page"}
        </label>
      ))}
      <label className="flex items-center gap-2">
        Posts a week
        <select value={n} onChange={(e) => setN(Number(e.target.value))} className="rounded-lg border border-white/10 bg-[#0c1326] px-2 py-1 text-white">
          {[2, 3, 4, 5, 6, 7].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      {dirty && <button type="button" disabled={pending || p.length === 0} className={secondary} onClick={() => run(() => updateSocialSettingsAction({ platforms: p, postsPerWeek: n }))}>Save</button>}
      <Note r={result} />
    </div>
  );
}

export function PlanButtons({ awaiting, weekly }: { awaiting: number; weekly: boolean }) {
  const { pending, result, setResult, run, start, router } = useRun();
  const [progress, setProgress] = useState<string | null>(null);

  function planMonth() {
    setResult(null);
    start(async () => {
      let total = 0;
      for (let w = 0; w < 4; w++) {
        setProgress(`Planning week ${w + 1} of 4…`);
        const r = await planAction({ offsetDays: w * 7 }).catch(() => ({ ok: false as const, error: "Something went wrong." }));
        if (!r.ok) { setProgress(null); setResult(r); router.refresh(); return; }
        total += r.created ?? 0;
      }
      setProgress(null);
      setResult({ ok: true, message: total ? `MAIRO planned ${total} posts for the next four weeks.` : "The next four weeks are already planned." });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={primary} onClick={() => run(() => planAction({}))}>{pending && !progress ? "Planning…" : "Plan next week"}</button>
        <button type="button" disabled={pending} className={secondary} onClick={planMonth}>Plan the month</button>
        {awaiting > 0 && (
          <button type="button" disabled={pending} className={weekly ? primary : secondary} onClick={() => run(approveWeekAction)}>
            Approve this week ({awaiting})
          </button>
        )}
      </div>
      {progress && <p role="status" className="mt-2 text-[13px] text-muted">{progress}</p>}
      <Note r={result} />
    </div>
  );
}

export function ResumeBanner() {
  const { pending, result, run } = useRun();
  return (
    <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-5">
      <p className="font-medium text-amber-200">Social Manager was paused</p>
      <p className="mt-1 text-[13.5px] text-white/80">Your Scale plan is active again. Resume to put paused posts back on the calendar; anything that missed its time waits for your approval rather than going out late.</p>
      <button type="button" disabled={pending} className={`${primary} mt-3`} onClick={() => run(resumeSocialAction)}>Resume Social Manager</button>
      <Note r={result} />
    </div>
  );
}
