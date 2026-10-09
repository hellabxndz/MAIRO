"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePlanAction, readWebsiteForPlanAction } from "@/lib/actions/strategy-actions";

// "Mairo is building your free plan." Two calls, one after the other, so each
// fits in a request: read the website (when there is one), then write the plan.

type Stage = "website" | "plan" | "done" | "error";

export function PlanBuilder({ website }: { website: string | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(website ? "website" : "plan");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run() {
    setError(null);
    if (website) {
      setStage("website");
      const r = await readWebsiteForPlanAction().catch(() => ({ ok: true, note: "Mairo couldn't read your website just now, so its website advice is general." }));
      if (r.note) setNote(r.note);
    }
    setStage("plan");
    const g = await generatePlanAction().catch(() => ({ ok: false as const, error: "Mairo couldn't finish your plan. Try again." }));
    if (!g.ok) {
      setStage("error");
      setError(g.error);
      return;
    }
    setStage("done");
    router.refresh();
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Starting the build is the point of opening this screen.
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One line per real request — reading the website, then writing the plan
  // (goal, budget, audience and ad ideas come back together). A line is
  // "in progress" only while its request is actually running.
  const steps = [
    ...(website ? [{ key: "website", label: `Your Strategy Agent reads ${website.replace(/^https?:\/\//, "").replace(/\/$/, "")}` }] : []),
    { key: "plan", label: "Your Strategy, Audience and Creative Agents write your plan: goal, budget, who to reach and first ad ideas" },
  ];
  const at = stage === "error" ? -1 : stage === "done" ? steps.length : steps.findIndex((s) => s.key === stage);

  return (
    <div className="mx-auto max-w-[560px] rounded-2xl border border-white/[0.07] bg-field/80 p-6 sm:p-8">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Free plan</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">Mairo is building your advertising plan</h1>
      <p className="mt-2 text-[14px] text-muted">This takes under a minute. You&rsquo;ll review everything and can change any part before moving on.</p>
      <ul className="mt-6 space-y-3">
        {steps.map((s, i) => {
          const done = at > i;
          const active = at === i;
          return (
            <li key={s.key} className="flex items-start gap-3 text-[14px]">
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                  done ? "border-emerald-400/40 text-emerald-300" : active ? "border-violet/60 text-violet-bright" : "border-white/10 text-faint"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={done || active ? "text-white" : "text-faint"}>
                {s.label}
                {active && <span className="ml-2 text-[12px] text-violet-bright">in progress</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {note && <p className="mt-5 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] text-muted">{note}</p>}
      {error && (
        <div className="mt-5">
          <p className="rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{error}</p>
          <button type="button" onClick={() => void run()} className="mt-3 min-h-[44px] rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
