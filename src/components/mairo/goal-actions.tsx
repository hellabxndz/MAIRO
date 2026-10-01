"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoalPicker, TellMairo } from "@/app/dashboard/mission/mission-client";
import type { MissionGoal } from "@/lib/mission/goals";
import { Modal } from "./overlay";
import { actionClass, quietClass } from "./action-styles";

// The two things an owner does from their goal — change it, or tell MAIRO
// what's new — in modals, so neither is a trip to another page.

export function ChangeGoalModalButton({ label = "Change goal", primary = false }: { label?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary ? actionClass : quietClass}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="What should MAIRO help you accomplish?" wide>
        <GoalPicker compact hideHeading onCancel={() => setOpen(false)} afterPlan={() => { setOpen(false); router.push("/dashboard/mission"); }} />
      </Modal>
    </>
  );
}

export function TellMairoModalButton({ label = "Tell Mairo something", initialText = "", primary = false }: { label?: string; initialText?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary ? actionClass : quietClass}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tell Mairo something">
        <p className="mb-3 text-[13.5px] text-muted">A promotion, a launch, something sold out, a new goal. MAIRO works out what to change and shows you before anything happens.</p>
        <TellMairo initialText={initialText} />
      </Modal>
    </>
  );
}

const STARTERS: { label: string; goal: MissionGoal | null; placeholder?: string }[] = [
  { label: "Get More Sales", goal: "INCREASE_SALES" },
  { label: "Get More Leads", goal: "GENERATE_LEADS" },
  { label: "Get More Bookings", goal: "GET_BOOKINGS" },
  { label: "Promote Something", goal: null, placeholder: 'What do you want to promote? e.g. "Our new summer menu" or "20% off this weekend"' },
  { label: "Let Mairo Recommend", goal: "RECOMMEND" },
];

/** The empty state's five starting points, each opening the goal flow. */
export function GoalStarters() {
  const [picked, setPicked] = useState<(typeof STARTERS)[number] | null>(null);
  const router = useRouter();
  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {STARTERS.map((s, i) => (
          <button key={s.label} type="button" onClick={() => setPicked(s)}
            className={i === 0 ? `${actionClass} min-h-[52px] text-[14px]` : `${quietClass} min-h-[52px] text-[14px]`}>
            {s.label}
          </button>
        ))}
      </div>
      <Modal open={Boolean(picked)} onClose={() => setPicked(null)} title={picked?.label ?? ""} wide>
        {picked && (
          <GoalPicker
            key={picked.label}
            compact
            hideHeading
            initialGoal={picked.goal}
            placeholder={picked.placeholder}
            onCancel={() => setPicked(null)}
            afterPlan={() => { setPicked(null); router.push("/dashboard/mission"); }}
          />
        )}
      </Modal>
    </>
  );
}
