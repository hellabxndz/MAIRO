"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setAiStatus } from "@/lib/dashboard/actions";

export function AiStatusControl({ status, canActivate, canToggle }: { status: string; canActivate: boolean; canToggle: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!canToggle) return null;

  const run = (target: "active" | "paused") =>
    start(async () => {
      const res = await setAiStatus(target);
      setMessage({ ok: res.ok, text: res.message });
      setConfirming(false);
    });

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {status === "active" ? (
        confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg-muted">Pause for all customers?</span>
            <Button size="sm" variant="danger" onClick={() => run("paused")} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Pause />} Pause
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            <Pause aria-hidden /> Pause AI
          </Button>
        )
      ) : (
        <Button onClick={() => run("active")} disabled={pending || !canActivate} title={canActivate ? undefined : "Test and publish your AI employee first"}>
          {pending ? <Loader2 className="animate-spin" /> : <Play aria-hidden />} {status === "paused" ? "Resume AI" : "Activate AI"}
        </Button>
      )}
      {!canActivate && status !== "active" && <p className="text-xs text-fg-subtle">Test and publish your AI employee to switch it on.</p>}
      {message && <p role="status" className={message.ok ? "text-xs text-success" : "text-xs text-danger"}>{message.text}</p>}
    </div>
  );
}
