"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

// The full conversation with your assistant.
//
// Same thread as the floating panel, on purpose. A question asked from a
// campaign screen and a question asked here are the same conversation, and a
// product where the chat bubble and the chat page have separate memories is a
// product that forgets what you told it depending on where you were standing.
//
// The composer is the only thing on the page that is always reachable — it is
// sticky at the bottom of the console rather than at the end of a growing
// list, so a long conversation never pushes the way to continue it off screen.

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
  /** What this business calls its assistant. */
  name: string;
  businessName: string;
  /** Prompts offered before the first message. */
  suggestions: string[];
  /**
   * A question carried in from another screen (`?ask=`), sent once on load.
   *
   * Arriving mid-conversation with a pre-filled box somebody then has to press
   * send on is a worse handoff than just asking — they clicked a button that
   * said "ask MAIRO about it", so ask.
   */
  autoAsk?: string | null;
  /** The campaign that question is about, so "it" resolves. */
  aboutCampaignId?: string | null;
};

export function AssistantConsole({
  threadId,
  initialMessages,
  name,
  businessName,
  suggestions,
  autoAsk,
  aboutCampaignId,
}: Props) {
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const sentAutoAsk = useRef(false);

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/agents/chat",
      body: { threadId },
    }),
  });

  const busy = status === "submitted" || status === "streaming";

  const hint = useMemo(
    () =>
      aboutCampaignId
        ? `The person is asking about campaign ${aboutCampaignId}. "This", "it" and "the campaign" mean that campaign.`
        : "",
    [aboutCampaignId],
  );

  const ask = useMemo(
    () => (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      sendMessage({ text: hint ? `${trimmed}\n\n(Context: ${hint})` : trimmed });
      setInput("");
    },
    [hint, sendMessage],
  );

  // The handoff question, sent once. Guarded by a ref rather than by state
  // because this must not re-fire when the stream updates `messages`.
  useEffect(() => {
    if (!autoAsk || sentAutoAsk.current) return;
    sentAutoAsk.current = true;
    ask(autoAsk);
  }, [autoAsk, ask]);

  // Follow the reply as it streams, inside the console rather than by moving
  // the page — the hero above stays where the person left it.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const empty = messages.length === 0;

  return (
    <section
      id="talk"
      className="relative flex min-h-[520px] flex-col overflow-hidden rounded-[var(--radius-panel)] border lg:min-h-[600px]"
      style={{
        borderColor: "var(--mairo-line)",
        backgroundImage: "var(--mairo-glass)",
        boxShadow: "var(--mairo-glow-soft)",
      }}
    >
      {/* Centred while empty, top-aligned once there is a conversation. A
          scroll container that starts its content at the top leaves a screen
          of dead space under four suggestions; one that centres a long thread
          would push the newest reply into the middle of the panel. */}
      <div
        ref={scroller}
        className={`flex-1 overflow-y-auto px-4 py-6 sm:px-7 ${empty ? "flex items-center" : ""}`}
      >
        {empty ? (
          <div className="mx-auto w-full max-w-2xl text-center">
            <p className="text-[17px] leading-relaxed text-white sm:text-[19px]">
              Ask {name} anything about {businessName}&rsquo;s advertising.
            </p>
            <p className="mx-auto mt-2.5 max-w-lg text-[13px] leading-relaxed text-muted">
              It can see your campaigns, what they have spent, what came back, and every
              change MAIRO has made.
            </p>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="rounded-xl border px-4 py-3 text-left text-[13px] leading-snug text-white/85 transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:-translate-y-0.5 hover:border-[color:var(--mairo-line-lit)] hover:text-white"
                  style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.02)" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m) => {
              const raw = m.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p) => p.text)
                .join("\n");
              // The context line is for the model. Showing it back would look
              // like the product talking to itself.
              const marker = raw.lastIndexOf("\n\n(Context: ");
              const text = marker === -1 ? raw : raw.slice(0, marker);
              if (!text) return null;

              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue/20 px-4 py-2.5 text-[14px] leading-relaxed text-white ring-1 ring-blue/30">
                      {text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className="flex gap-3">
                  <AssistantMark />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                      {name}
                    </p>
                    <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-white/90">
                      {text}
                    </div>
                  </div>
                </div>
              );
            })}

            {busy && (
              <div className="flex gap-3">
                <AssistantMark />
                <p className="pt-1 text-[12.5px] text-faint">
                  <span className="mairo-think">{name} is thinking…</span>
                </p>
              </div>
            )}

            {/* A swallowed failure reads as the assistant ignoring you. */}
            {error && (
              <div
                className="rounded-xl border px-4 py-3"
                style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)" }}
              >
                <p className="text-[13px] leading-relaxed text-alert">
                  {error.message || "Something went wrong reaching your assistant."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          ask(input);
        }}
        className="border-t px-4 py-4 sm:px-7"
        style={{ borderColor: "var(--mairo-line)" }}
      >
        <div
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border px-4 py-2.5 transition-colors duration-300 focus-within:border-[color:var(--mairo-line-lit)]"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.6)" }}
        >
          <textarea
            ref={composer}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, shift+enter breaks the line. The alternative —
              // enter always breaking — means every message needs a mouse.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy) ask(input);
              }
            }}
            rows={1}
            placeholder={`Message ${name}…`}
            aria-label={`Message ${name}`}
            className="max-h-40 min-h-[24px] min-w-0 flex-1 resize-none bg-transparent py-1 text-[14px] leading-relaxed text-white placeholder-faint outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-all duration-300 hover:brightness-110 disabled:opacity-35"
            style={{ backgroundImage: "var(--mairo-ramp)" }}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
              <path
                d="M10 16V4M5 9l5-5 5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="mx-auto mt-2.5 max-w-3xl text-center text-[11px] leading-relaxed text-faint">
          {name} works from your account and what the ad platforms report back. It can be
          wrong about things it cannot see — check anything that would cost you money.
        </p>
      </form>

      <style>{`
        .mairo-think { animation: mairo-think 1.6s ease-in-out infinite; }
        @keyframes mairo-think { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .mairo-think { animation: none; } }
      `}</style>
    </section>
  );
}

/** The small mark beside each reply, so a thread scans as a conversation. */
function AssistantMark() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none">
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 3.8v16.4M3.8 9.6h16.4M3.8 14.4h16.4" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </span>
  );
}
