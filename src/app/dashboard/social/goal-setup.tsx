"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { planAction, setGoalAction } from "@/lib/actions/social-manager-actions";
import { GOALS, GOAL_PROMOTION, PROMOTION_FIELDS, type GoalKey } from "@/lib/social/goals";
import type { Network } from "@/lib/instagram/social-logic";

// Social Manager's first screen. It doesn't ask for a post: it asks what the
// business wants to achieve, and MAIRO builds the strategy from that.

const input = "w-full rounded-lg border border-white/10 bg-[#0c1326] px-3 py-2 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60";

export function GoalSetup({
  initial,
  businessName,
  onCancel,
}: {
  initial?: { goal: GoalKey; goalDetail: string; platforms: Network[]; postsPerWeek: number } | null;
  businessName: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState<GoalKey | null>(initial?.goal ?? null);
  const [detail, setDetail] = useState(initial?.goalDetail ?? "");
  const [platforms, setPlatforms] = useState<Network[]>(initial?.platforms ?? ["INSTAGRAM"]);
  const [perWeek, setPerWeek] = useState(initial?.postsPerWeek ?? 4);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const kind = goal ? GOAL_PROMOTION[goal] : undefined;
  const fields = kind ? PROMOTION_FIELDS[kind] : [];

  function toggle(n: Network) {
    setPlatforms((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  }

  function submit() {
    if (!goal) return;
    setError(null);
    start(async () => {
      setStage("MAIRO is learning your business and building your strategy…");
      const r = await setGoalAction({ goal, goalDetail: detail, platforms, postsPerWeek: perWeek, details }).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
      if (!r.ok) {
        setStage(null);
        setError(r.error);
        return;
      }
      setStage("Planning your first week of posts…");
      await planAction({}).catch(() => null);
      setStage(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-violet/30 bg-violet/[0.05] p-5 sm:p-7">
      <h2 className="text-[22px] font-semibold leading-snug text-white">What do you want MAIRO to help your business accomplish?</h2>
      <p className="mt-1.5 max-w-[640px] text-[14px] text-muted">
        Tell MAIRO the goal. It works out what {businessName || "your business"} should post to get there, builds the plan, and shows you every post before it goes out.
      </p>

      <div role="radiogroup" aria-label="Your goal" className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {GOALS.map((g) => (
          <button
            key={g.key}
            type="button"
            role="radio"
            aria-checked={goal === g.key}
            onClick={() => setGoal(g.key)}
            className={`min-h-[48px] rounded-xl border px-4 py-2.5 text-left text-[14px] transition ${
              goal === g.key ? "border-violet-400 bg-violet/[0.18] text-white" : "border-white/10 bg-white/[0.02] text-white/85 hover:border-white/25"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="text-[14px] font-medium text-white">Describe your goal</span>
        <span className="ml-2 text-[12.5px] text-faint">optional, but it helps</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={1000}
          className={`${input} mt-1.5`}
          placeholder={`e.g. "We're launching a new clothing collection Friday and want to sell as much as possible."`}
        />
      </label>

      {fields.length > 0 && (
        <fieldset className="mt-5 rounded-xl border border-white/10 p-4">
          <legend className="px-1 text-[14px] font-medium text-white">Tell MAIRO about it</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
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
          <p className="mt-3 text-[12.5px] text-faint">Product photos and videos: add them in Creative Studio or a campaign, and MAIRO uses them in the posts. Posts without one are planned as drafts telling you what to shoot.</p>
        </fieldset>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3 text-[14px] text-white/90">
          <span className="text-white">Post on</span>
          {(["INSTAGRAM", "FACEBOOK"] as Network[]).map((n) => (
            <label key={n} className="flex items-center gap-2">
              <input type="checkbox" checked={platforms.includes(n)} onChange={() => toggle(n)} className="h-4 w-4 accent-[#7c5cff]" />
              {n === "INSTAGRAM" ? "Instagram" : "Facebook Page"}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[14px] text-white/90">
          Posts a week
          <select value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value))} className="rounded-lg border border-white/10 bg-[#0c1326] px-2 py-1.5 text-white">
            {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mt-4 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!goal || pending || platforms.length === 0}
          onClick={submit}
          className="min-h-[46px] rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Working…" : initial ? "Rebuild my strategy" : "Build my strategy"}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="min-h-[46px] rounded-lg border border-white/12 px-5 text-[14px] text-white/85">Cancel</button>}
        {stage && <span role="status" className="text-[13px] text-muted">{stage}</span>}
      </div>
      <p className="mt-3 text-[12px] text-faint">Nothing is posted until you approve it. You can change the goal any time.</p>
    </div>
  );
}
