"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Takes the plan this browser saved into the signed-in business, then moves on. */
export function ClaimPlan() {
  const router = useRouter();
  const [note, setNote] = useState("Bringing your free plan into your account…");
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/free-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claim: true }) });
        const j = (await res.json()) as { ok?: boolean; claimed?: boolean; next?: string; error?: string };
        if (!res.ok || !j.ok) setNote(j.error ?? "Your plan couldn't be added — you can make it again from the free plan page.");
        router.replace(j.next ?? "/onboarding");
      } catch {
        router.replace("/onboarding");
      }
    })();
  }, [router]);
  return <p role="status" className="text-[15px] text-white/70">{note}</p>;
}
