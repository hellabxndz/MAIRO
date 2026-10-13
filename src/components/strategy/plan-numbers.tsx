"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ToolHandoff } from "@/components/onboarding/tool-handoff";
import { setPlanEconomicsAction } from "@/lib/actions/strategy-actions";

// Under "What this plan is built on": take the owner's calculator numbers out
// of the plan, or use ones saved on this device by a free calculator since
// setup. Nothing changes until they press a button.

/** `stored`: none, numbers the plan uses, or numbers for another goal (kept, not used). */
export function PlanNumbers({ stored, goal }: { stored: "none" | "used" | "other-goal"; goal: string }) {
  const has = stored !== "none";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tool = goal === "SALES" ? "/tools/break-even-roas" : goal === "LEADS" ? "/tools/service-lead-economics" : null;
  return (
    <div className="mt-3">
      {stored === "other-goal" && <p className="mb-1 text-[12.5px] text-muted">Your calculator numbers are for a different goal, so this plan doesn&rsquo;t use them.</p>}
      {has ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setPlanEconomicsAction(null);
              if (!r.ok) setError(r.error);
              else router.refresh();
            })
          }
          className="text-[12.5px] text-violet-bright underline-offset-2 hover:text-white hover:underline disabled:opacity-60"
        >
          Don&rsquo;t use my calculator numbers
        </button>
      ) : (
        tool && <Link href={tool} className="text-[12.5px] text-violet-bright underline-offset-2 hover:text-white hover:underline">Work out the most a {goal === "SALES" ? "sale" : "lead"} can cost</Link>
      )}
      <ToolHandoff
        kinds={["economics"]}
        onUse={(h) => {
          if (h.kind !== "economics") return "";
          start(async () => {
            const r = await setPlanEconomicsAction(h.economics);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
          return "used in this plan";
        }}
      />
      {error && <p role="alert" className="mt-2 text-[12.5px] text-amber-200">{error}</p>}
    </div>
  );
}
