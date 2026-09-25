"use client";

import { Bot, BookOpen, Loader2, RotateCcw, Send, Wrench } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import type { StoredMessage } from "@/lib/ai/turn";
import { resetPreview, sendPreviewMessage } from "@/lib/ai-employee/actions";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Searched knowledge base",
  get_business_policy: "Read a policy",
  escalate_to_human: "Handed over to a person",
  capture_lead: "Saved a lead",
  search_products: "Searched products",
  get_product_details: "Looked up a product",
  check_availability: "Checked availability",
  request_order_verification: "Sent an order verification code",
  verify_order_code: "Verified the customer",
  get_order_status: "Looked up an order",
};

export function PreviewChat({
  name,
  welcomeMessage,
  brandColor,
  initialMessages,
  enabled,
  disabledReason,
}: {
  name: string;
  welcomeMessage: string;
  brandColor: string;
  initialMessages: StoredMessage[];
  enabled: boolean;
  disabledReason?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [waiting, setWaiting] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, waiting]);

  const send = () => {
    const t = text.trim();
    if (!t || pending) return;
    setText("");
    setError(null);
    setWaiting(t);
    start(async () => {
      const r = await sendPreviewMessage(t);
      setWaiting(null);
      if (r.messages) setMessages(r.messages);
      if (!r.ok) setError(r.message);
      else if (r.notice) setError(r.notice);
    });
  };

  return (
    <div className="glass flex h-[600px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}bb)` }}>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{name}</p>
          <p className="flex items-center gap-1 text-[11px] text-white/80"><Bot className="size-3" aria-hidden /> Preview · uses your saved draft</p>
        </div>
        <button
          type="button"
          aria-label="Start a new preview"
          className="rounded-lg p-2 hover:bg-white/15"
          onClick={() =>
            start(async () => {
              const r = await resetPreview();
              setError(r.ok ? null : r.message);
              if (r.ok) setMessages([]);
            })
          }
        >
          <RotateCcw className="size-4" />
        </button>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white/[0.06] px-3.5 py-2.5 text-sm">{welcomeMessage}</div>
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.sender_type === "customer" ? "items-end" : "items-start")}>
            <div className={cn("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm", m.sender_type === "customer" ? "rounded-br-sm bg-electric/25" : "rounded-bl-sm bg-white/[0.06]")}>
              {m.content}
            </div>
            {m.sender_type === "ai" && (m.tool_names.length > 0 || m.sources.length > 0) && (
              <div className="mt-1 flex max-w-[88%] flex-wrap gap-1.5 text-[11px] text-fg-subtle">
                {[...new Set(m.tool_names)].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5"><Wrench className="size-3" aria-hidden />{TOOL_LABELS[t] ?? t}</span>
                ))}
                {m.sources.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-violet/10 px-2 py-0.5 text-violet-glow"><BookOpen className="size-3" aria-hidden />{s.title}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {waiting && (
          <>
            <div className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-br-sm bg-electric/25 px-3.5 py-2.5 text-sm opacity-70">{waiting}</div></div>
            <div className="flex w-fit gap-1 rounded-2xl rounded-bl-sm bg-white/[0.06] px-4 py-3" aria-label={`${name} is typing`}>
              {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-typing rounded-full bg-fg-muted" style={{ animationDelay: `${d * 0.15}s` }} />)}
            </div>
          </>
        )}
      </div>

      {error && <div className="px-3 pb-2"><Alert tone="warning">{error}</Alert></div>}
      {!enabled && disabledReason && <div className="px-3 pb-2"><Alert tone="warning">{disabledReason}</Alert></div>}
      <form
        className="flex items-center gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          disabled={!enabled}
          placeholder={enabled ? "Ask something a customer would…" : "Preview unavailable"}
          aria-label="Test message"
          className="h-10 flex-1 rounded-full bg-white/5 px-4 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-violet/30"
        />
        <button type="submit" disabled={!enabled || pending || !text.trim()} aria-label="Send test message" className="flex size-10 items-center justify-center rounded-full text-white disabled:opacity-40" style={{ background: brandColor }}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  );
}
