"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DecisionView } from "@/lib/decisions/store";
import { ignoreDecisionAction } from "@/lib/actions/decision-actions";
import { ApprovalModal } from "@/components/decisions/approval-modal";
import { primaryAction, quietAction } from "./kit";

// The Action Center's controls for one recommendation, wired to the same
// approval flow as the Approval Center: Approve opens the confirmation with
// every change and its budget shown, and nothing is sent to Meta until it's
// confirmed there. "Not now" sets it aside; "Why?" asks the AI team.

export function DecisionControls({ decision }: { decision: DecisionView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionable = decision.changes.some((c) => c.type !== "guide");
  const ask = `/dashboard/agents?ask=${encodeURIComponent(`Why are you recommending this: "${decision.title}"?`)}`;

  if (done) return <p className="text-[12.5px] text-muted">{done}</p>;
  return (
    <>
      {actionable ? (
        <button type="button" className={primaryAction} onClick={() => setOpen(true)}>
          Review &amp; approve
        </button>
      ) : (
        <Link href={`/dashboard/decisions#d-${decision.id}`} className={primaryAction}>
          See what to do
        </Link>
      )}
      <button
        type="button"
        disabled={pending}
        className={quietAction}
        onClick={() =>
          start(async () => {
            const r = await ignoreDecisionAction(decision.id);
            if (r.ok) {
              setDone("Set aside — it's in your Approval Center if you change your mind.");
              router.refresh();
            } else setError(r.error ?? "That didn't work. Try again.");
          })
        }
      >
        Not now
      </button>
      <Link href={ask} className="px-2 text-[12.5px] text-violet-bright hover:text-white">
        Why?
      </Link>
      {error && <p role="alert" className="w-full text-[12px] text-alert">{error}</p>}
      {open && (
        <ApprovalModal
          decisions={[decision]}
          onClose={() => setOpen(false)}
          onDone={(applied) => {
            setOpen(false);
            if (applied) {
              setDone("Approved — MAIRO made the change and recorded it.");
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}
