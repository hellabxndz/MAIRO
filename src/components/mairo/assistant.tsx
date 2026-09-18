"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

// MAIRO, reachable from anywhere in the dashboard.
//
// One assistant, not three. The product used to offer a strategist, a creative
// director and support as separate things to choose between, which made the
// customer route their own question before asking it — and getting that choice
// wrong is a worse answer than asking the wrong specialist would have been.
//
// It talks to /api/agents/chat, the same endpoint the full-page chat uses, on
// the same thread. So a conversation started here continues on /dashboard/agents
// and the other way round: there is one history, not a panel that forgets.
//
// Context is the point of it being a panel rather than a page. It knows which
// screen it was opened from and, on a campaign, which campaign — so "why is this
// doing badly" resolves to the campaign the person is looking at instead of
// asking them which one they mean.
//
// Desktop: a side panel. Mobile: a bottom sheet, because a side panel on a
// phone is a full-screen takeover with extra steps.

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
  /** What this account is called, for the opening line. */
  businessName: string;
};

/** What the person is looking at, worked out from the URL. */
function useScreenContext() {
  const pathname = usePathname();
  return useMemo(() => {
    const campaign = pathname.match(/^\/dashboard\/campaigns\/([^/]+)/)?.[1] ?? null;
    if (campaign) {
      return {
        label: "this campaign",
        // Sent with the message so the model resolves "this" the same way the
        // person means it. Without it, every question about the screen they are
        // on becomes a question about the account in general.
        hint: `The person is looking at campaign ${campaign}. "This", "it" and "the campaign" mean that campaign.`,
        prompts: [
          "Why is this campaign doing badly?",
          "What has MAIRO changed on it?",
          "Should I increase the budget?",
          "Which ad is performing best?",
        ],
      };
    }
    if (pathname.startsWith("/dashboard/creatives")) {
      return {
        label: "your ads",
        hint: "The person is looking at their ad creatives.",
        prompts: ["Make me another ad", "Which creative is working best?", "Write a shorter hook"],
      };
    }
    if (pathname.startsWith("/dashboard/analytics")) {
      return {
        label: "your results",
        hint: "The person is looking at their performance figures.",
        prompts: ["How are my ads doing?", "Why did my sales drop?", "What should I improve?"],
      };
    }
    return {
      label: "your account",
      hint: "",
      prompts: [
        "How are my ads doing?",
        "What is MAIRO changing?",
        "Should I increase my budget?",
        "Show me what I can improve",
      ],
    };
  }, [pathname]);
}

export function MairoAssistant({ threadId, initialMessages, businessName }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const ctx = useScreenContext();
  const scroller = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/agents/chat",
      // SUPPORT is the one that answers about the account as a whole rather
      // than only strategy or only creative, which is what a general-purpose
      // assistant needs to be.
      body: { threadId, agentType: "SUPPORT" },
    }),
  });

  const busy = status === "submitted" || status === "streaming";

  // Follow the conversation as it streams. Scrolling the container rather than
  // the page, so opening the panel never moves the screen behind it.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Escape closes, as every other overlay in the product does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const ask = (text: string) => {
    const body = ctx.hint ? `${text}\n\n(Context: ${ctx.hint})` : text;
    sendMessage({ text: body });
    setInput("");
  };

  return (
    <>
      {/* The launcher. Above the mobile bottom bar rather than behind it. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask MAIRO"
          className="fixed bottom-[88px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform duration-300 [transition-timing-function:var(--ease-mairo)] hover:scale-105 lg:bottom-6 lg:right-6"
          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 3.8v16.4M3.8 9.6h16.4M3.8 14.4h16.4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="MAIRO assistant"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-3xl border-t lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-l lg:border-t-0"
            style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(6,10,24,0.98)" }}
          >
            <header
              className="flex items-center gap-3 border-b px-5 py-4"
              style={{ borderColor: "var(--mairo-line)" }}
            >
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live/60" />
                <span className="relative h-2 w-2 rounded-full bg-live" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-white">MAIRO</p>
                <p className="truncate text-[11.5px] text-faint">Looking at {ctx.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted transition-colors hover:text-white"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <div>
                  <p className="text-[15px] leading-relaxed text-white">
                    Ask me anything about {businessName}&rsquo;s advertising.
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    I can see your campaigns, your numbers and everything I&rsquo;ve changed.
                  </p>
                  <div className="mt-5 space-y-2">
                    {ctx.prompts.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => ask(q)}
                        className="w-full rounded-xl border px-3.5 py-2.5 text-left text-[13px] text-white/85 transition-colors hover:border-[color:var(--mairo-line-lit)] hover:text-white"
                        style={{ borderColor: "var(--mairo-line)" }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => {
                    const raw = m.parts
                      .filter((p): p is { type: "text"; text: string } => p.type === "text")
                      .map((p) => p.text)
                      .join("\n");
                    // The context hint is for the model, not the person who
                    // typed the question — showing it back would look like the
                    // product talking to itself. Cut by index rather than a
                    // dot-all regex, which needs a newer target than this
                    // project compiles to.
                    const marker = raw.lastIndexOf("\n\n(Context: ");
                    const text = marker === -1 ? raw : raw.slice(0, marker);
                    if (!text) return null;
                    return (
                      <div
                        key={m.id}
                        className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                      >
                        <div
                          className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                            m.role === "user"
                              ? "bg-blue/20 text-white ring-1 ring-blue/30"
                              : "text-white/90"
                          }`}
                          style={
                            m.role === "assistant"
                              ? { background: "rgba(255,255,255,0.04)" }
                              : undefined
                          }
                        >
                          {text}
                        </div>
                      </div>
                    );
                  })}
                  {busy && (
                    <p className="text-[12.5px] text-faint">
                      <span className="mairo-think">Thinking…</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!input.trim() || busy) return;
                ask(input.trim());
              }}
              className="border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              style={{ borderColor: "var(--mairo-line)" }}
            >
              <div
                className="flex items-center gap-2 rounded-full border px-4 py-2"
                style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.6)" }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask MAIRO…"
                  aria-label="Ask MAIRO"
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white placeholder-faint outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className="shrink-0 text-blue-bright transition-colors hover:text-white disabled:opacity-40"
                >
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
                    <path
                      d="M3 10h13M11 5l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </form>
          </aside>
        </>
      )}

      <style>{`
        .mairo-think { animation: mairo-think 1.6s ease-in-out infinite; }
        @keyframes mairo-think { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .mairo-think { animation: none; } }
      `}</style>
    </>
  );
}
