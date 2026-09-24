"use client";

import { Loader2, Rocket } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publishAiEmployee } from "@/lib/ai-employee/actions";

export function PublishBar({ hasUnpublished, testedSinceSave, canPublish }: { hasUnpublished: boolean; testedSinceSave: boolean; canPublish: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!canPublish) return null;
  return (
    <div className="space-y-3">
      {result && <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>}
      {open ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-violet/30 bg-violet/5 p-4 sm:flex-row sm:items-center">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="What changed? (optional)" aria-label="Version note" />
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await publishAiEmployee(note);
                  setResult(r);
                  if (r.ok) {
                    setOpen(false);
                    setNote("");
                  }
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Rocket aria-hidden />} Confirm publish
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => { setResult(null); setOpen(true); }} disabled={!hasUnpublished} variant={hasUnpublished ? "primary" : "secondary"}>
            <Rocket aria-hidden /> Publish Changes
          </Button>
          <span className="text-xs text-fg-subtle">
            {hasUnpublished
              ? testedSinceSave
                ? "Your draft has changes that customers don't see yet."
                : "Your draft has changes customers don't see yet. Try them in the preview first."
              : "Customers see your latest saved version."}
          </span>
        </div>
      )}
    </div>
  );
}
