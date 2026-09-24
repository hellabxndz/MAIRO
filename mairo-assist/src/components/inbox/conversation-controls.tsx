"use client";

import { Bot, CheckCircle2, Hand, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { handBackToAi, replyAsHuman, resolveConversation, takeOver, type InboxResult } from "@/lib/inbox/actions";

/** Keeps the open conversation fresh while someone is looking at it. */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

export function ConversationControls({
  conversationId,
  handledBy,
  status,
  canTakeOver,
  canReply,
}: {
  conversationId: string;
  handledBy: "ai" | "human";
  status: string;
  canTakeOver: boolean;
  canReply: boolean;
}) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [result, setResult] = useState<InboxResult | null>(null);
  const run = (fn: () => Promise<InboxResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) after?.();
    });

  return (
    <div className="space-y-3 border-t border-line p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">
        {canTakeOver && handledBy === "ai" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => takeOver(conversationId))}>
            <Hand aria-hidden /> Take over
          </Button>
        )}
        {canTakeOver && handledBy === "human" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => handBackToAi(conversationId))}>
            <Bot aria-hidden /> Hand back to AI
          </Button>
        )}
        {canReply && status !== "resolved" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resolveConversation(conversationId))}>
            <CheckCircle2 aria-hidden /> Mark resolved
          </Button>
        )}
        {pending && <Loader2 className="size-4 animate-spin self-center text-fg-subtle" aria-label="Working" />}
      </div>
      {result && <p role="status" className={result.ok ? "text-xs text-success" : "text-xs text-danger"}>{result.message}</p>}
      {canReply && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t) run(() => replyAsHuman(conversationId, t), () => setText(""));
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={handledBy === "ai" ? "Reply as your team (this takes over from the AI)…" : "Reply to the customer…"}
            aria-label="Reply"
            className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-ink-900/70 px-3.5 py-2.5 text-sm placeholder:text-fg-subtle focus:border-violet/60 focus:outline-none focus:ring-2 focus:ring-violet/25"
          />
          <Button type="submit" disabled={pending || !text.trim()} aria-label="Send reply">
            <Send aria-hidden /> Send
          </Button>
        </form>
      )}
    </div>
  );
}
