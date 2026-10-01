"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveMissionAction,
  discardProposalAction,
  endNoteAction,
  secondaryGoalAction,
  startMissionAction,
  tellMairoAction,
} from "@/lib/actions/mission-actions";
import { planAction } from "@/lib/actions/social-manager-actions";
import { MISSION_GOALS, type MissionGoal } from "@/lib/mission/goals";

// The interactive parts of the MAIRO Mission: picking a goal (or saying it in
// your own words), answering at most two questions, approving the plan, and
// telling MAIRO when something changes.

const input = "w-full rounded-lg border border-white/10 bg-[#0c1326] px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60";
const primary = "min-h-[44px] rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white transition hover:brightness-110 disabled:opacity-50";
const secondary = "min-h-[44px] rounded-lg border border-white/12 px-4 text-[14px] text-white/85 transition hover:border-white/30 disabled:opacity-50";

type Question = { key: string; question: string; placeholder: string };

function Err({ text }: { text: string | null }) {
  return text ? <p role="alert" className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{text}</p> : null;
}

export function GoalPicker({ initialGoal = null, onCancel, compact = false }: { initialGoal?: MissionGoal | null; onCancel?: () => void; compact?: boolean }) {
  const router = useRouter();
  const [goal, setGoal] = useState<MissionGoal | null>(initialGoal);
  const [request, setRequest] = useState("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const r = await startMissionAction({ goal, request, answers: questions ? answers : undefined }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
      if (!r.ok) return setError(r.error);
      if (r.kind === "questions") return setQuestions(r.questions);
      router.refresh();
    });
  }

  return (
    <div className={compact ? "" : "rounded-2xl border border-violet/30 bg-violet/[0.05] p-5 sm:p-7"}>
      <h2 className="text-[22px] font-semibold leading-snug text-white">What do you want MAIRO to help your business accomplish?</h2>
      <p className="mt-1.5 max-w-[640px] text-[14px] text-muted">Tell MAIRO the outcome. It works out the marketing — ads{" "}and, on Scale, your social posts — and shows you the plan before anything happens.</p>

      <label className="mt-5 block">
        <span className="text-[14px] font-medium text-white">In your own words</span>
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={2}
          maxLength={1000}
          className={`${input} mt-1.5`}
          placeholder={`e.g. "We're a car detailing business and want more ceramic coating bookings."`}
          aria-label="What you want MAIRO to help with"
        />
      </label>
      <p className="mt-4 text-[13px] text-faint">Or pick one:</p>
      <div role="radiogroup" aria-label="Your goal" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {MISSION_GOALS.map((g) => (
          <button key={g.key} type="button" role="radio" aria-checked={goal === g.key} onClick={() => setGoal(goal === g.key ? null : g.key)}
            className={`min-h-[46px] rounded-xl border px-4 py-2 text-left text-[14px] transition ${goal === g.key ? "border-violet-400 bg-violet/[0.18] text-white" : "border-white/10 bg-white/[0.02] text-white/85 hover:border-white/25"}`}>
            {g.label}
          </button>
        ))}
      </div>

      {questions && (
        <fieldset className="mt-5 space-y-3 rounded-xl border border-white/10 p-4">
          <legend className="px-1 text-[14px] font-medium text-white">One quick thing, so the plan fits</legend>
          {questions.map((q) => (
            <label key={q.key} className="block">
              <span className="text-[13.5px] text-white/90">{q.question}</span>
              <input value={answers[q.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} className={`${input} mt-1`} placeholder={q.placeholder} />
            </label>
          ))}
        </fieldset>
      )}

      <Err text={error} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || (!goal && !request.trim())} onClick={submit} className={primary}>
          {pending ? "MAIRO is building your plan…" : questions ? "Continue" : "Build my plan"}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className={secondary}>Cancel</button>}
      </div>
      <p className="mt-3 text-[12px] text-faint">Nothing is launched, posted or spent until you approve it.</p>
    </div>
  );
}

export function ApproveBar({ missionId, scale }: { missionId: string; scale: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} className={primary}
          onClick={() => start(async () => {
            setError(null);
            setStage("Approving…");
            const r = await approveMissionAction(missionId).catch(() => ({ ok: false as const, error: "Something went wrong." }));
            if (!r.ok) { setStage(null); return setError(r.error); }
            if (r.social && scale) {
              setStage("Planning this week's social posts for your goal…");
              await planAction({}).catch(() => null);
            }
            setStage(null);
            setDraft(r.draftId);
            router.refresh();
          })}>
          {pending ? stage ?? "Working…" : "Approve the plan"}
        </button>
        <button type="button" disabled={pending} className={secondary} onClick={() => start(async () => { await discardProposalAction(missionId); router.refresh(); })}>
          Not this one
        </button>
      </div>
      {draft && (
        <p className="mt-3 text-[13px] text-emerald-300">
          Approved. MAIRO prefilled your campaign — <Link className="underline underline-offset-4" href={`/dashboard/create/meta?draft=${draft}`}>review it and confirm the budget</Link>.
        </p>
      )}
      <Err text={error} />
    </div>
  );
}

export function TellMairo({ placeholder }: { placeholder?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message: string; actions: string[]; missionId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        start(async () => {
          const r = await tellMairoAction(text).catch(() => ({ ok: false as const, error: "Something went wrong." }));
          if (!r.ok) return setError(r.error);
          if (r.kind === "questions") return setResult({ message: `${r.message} ${r.questions?.map((q) => q.question).join(" ")} Add it to what you told MAIRO and send again.`, actions: [] });
          setResult(r);
          setText("");
          router.refresh();
        });
      }}>
        <label className="sr-only" htmlFor="tell-mairo">Tell MAIRO something new</label>
        <input id="tell-mairo" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className={input}
          placeholder={placeholder ?? `e.g. "We're doing 20% off this weekend." or "We sold out of the blue hoodie."`} />
        <button type="submit" disabled={pending || text.trim().length < 3} className={`${primary} shrink-0`}>{pending ? "Thinking…" : "Tell MAIRO"}</button>
      </form>
      <Err text={error} />
      {result && (
        <div role="status" className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3.5">
          <p className="text-[14px] text-emerald-200">{result.message}</p>
          {result.actions.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13px] text-white/80">
              {result.actions.map((a) => <li key={a}>• {a}</li>)}
            </ul>
          )}
          {result.missionId && <Link href="/dashboard/mission" className="mt-2 inline-block text-[13px] text-violet-bright underline underline-offset-4">Review MAIRO&rsquo;s plan</Link>}
        </div>
      )}
    </div>
  );
}

export function ChangeGoalButton() {
  const [open, setOpen] = useState(false);
  if (open) return <div className="mt-4 w-full"><GoalPicker onCancel={() => setOpen(false)} /></div>;
  return <button type="button" onClick={() => setOpen(true)} className={secondary}>Change goal</button>;
}

export function SecondaryGoal({ current, primary: primaryGoal }: { current: MissionGoal | null; primary: MissionGoal }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(current ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={secondary}>{current ? "Change secondary goal" : "Add secondary goal"}</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[44px] rounded-lg border border-white/10 bg-[#0c1326] px-3 text-[14px] text-white" aria-label="Secondary goal">
        <option value="">No secondary goal</option>
        {MISSION_GOALS.filter((g) => g.key !== primaryGoal && g.key !== "RECOMMEND").map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
      </select>
      <button type="button" disabled={pending} className={primary} onClick={() => start(async () => {
        setError(null);
        const r = await secondaryGoalAction(value || null).catch(() => ({ ok: false as const, error: "Something went wrong." }));
        if (!r.ok) return setError(r.error);
        setOpen(false);
        router.refresh();
      })}>{pending ? "Re-planning…" : "Update the plan"}</button>
      <button type="button" className={secondary} onClick={() => setOpen(false)}>Cancel</button>
      <Err text={error} />
    </div>
  );
}

export function EndNote({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await endNoteAction(id); router.refresh(); })}
      className="shrink-0 rounded-lg border border-white/12 px-2.5 py-1 text-[12px] text-white/70 hover:border-white/30">
      {label}
    </button>
  );
}

/** The two things an owner does from the goal: change it, or tell MAIRO what's new. */
export function GoalActions() {
  const [open, setOpen] = useState<"goal" | "tell" | null>(null);
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(open === "goal" ? null : "goal")} className={open === "goal" ? primary : secondary} aria-expanded={open === "goal"}>Change goal</button>
        <button type="button" onClick={() => setOpen(open === "tell" ? null : "tell")} className={open === "tell" ? primary : secondary} aria-expanded={open === "tell"}>Tell MAIRO something new</button>
      </div>
      {open === "goal" && <div className="mt-4"><GoalPicker onCancel={() => setOpen(null)} /></div>}
      {open === "tell" && <div className="mt-4"><TellMairo /></div>}
    </div>
  );
}
