"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { confirmProposalAction } from "@/lib/actions/founder-actions";
import { AiCore } from "@/components/aios/ai-core";

// JARVIS: the AIOS assistant. It reads the platform's records through its
// tools and proposes changes to the founder's workspace; a proposal is only a
// card until someone presses Confirm, which runs a server action that checks
// staff access again and logs it. Voice is opt-in and push-to-talk: the
// microphone listens only after the mic button is pressed, stops when pressed
// again, and puts what it heard in the box to read before sending. Replies are
// read aloud only if "Speak replies" is switched on.

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type SpeechRecCtor = new () => SpeechRec;

function recognition(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SUGGESTIONS = ["What needs me today?", "How much did Stripe collect in the last 30 days?", "Any Meta problems right now?", "What's overdue on my projects?"];

type ProposalOutput = { ok: true; needsConfirmation: true; summary: string; proposal: unknown } | { ok: false; error: string };
type CardState = { phase: "idle" | "saving" | "done" | "dismissed" | "error"; message?: string };

const TOOL_LABEL: Record<string, string> = { get_briefing: "Read today's signals", find_business: "Looked up businesses", list_work: "Read your projects" };

function textOf(m: UIMessage) {
  return m.parts.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n");
}

export function Jarvis({ threadId, initialMessages }: { threadId: string; initialMessages: UIMessage[] }) {
  const [input, setInput] = useState("");
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [speak, setSpeak] = useState(false);
  const speakRef = useRef(false);
  const rec = useRef<SpeechRec | null>(null);

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/agents/chat", body: { threadId } }),
    onFinish: ({ message }) => {
      if (!speakRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
      const t = textOf(message).trim();
      if (t) window.speechSynthesis.speak(new SpeechSynthesisUtterance(t.slice(0, 1200)));
    },
  });
  const pending = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    if (!text.trim() || pending) return;
    sendMessage({ text });
    setInput("");
  };

  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognition();
    if (!Ctor) {
      setVoiceNote("Voice input isn't available in this browser. Typing works everywhere.");
      return;
    }
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    const before = input ? `${input.trim()} ` : "";
    r.onresult = (e) => {
      const heard = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join("");
      setInput(before + heard);
    };
    r.onerror = (e) => setVoiceNote(e.error === "not-allowed" ? "Microphone access was blocked. Allow it in the browser to talk to JARVIS." : "Didn't catch that. Try again.");
    r.onend = () => setListening(false);
    rec.current = r;
    setVoiceNote(null);
    setListening(true);
    r.start();
  };

  const confirm = async (id: string, proposal: unknown) => {
    setCards((c) => ({ ...c, [id]: { phase: "saving" } }));
    const r = await confirmProposalAction(proposal);
    setCards((c) => ({ ...c, [id]: r.ok ? { phase: "done", message: r.message } : { phase: "error", message: r.error } }));
  };

  return (
    <div className="flex h-[calc(100dvh-150px)] min-h-[520px] flex-col overflow-hidden rounded-[24px] border border-[color:var(--mairo-line)]">
      <div className="flex items-center gap-3 border-b border-[color:var(--mairo-line)] px-4 py-3 sm:px-5">
        <AiCore state={error ? "attention" : "steady"} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-white">JARVIS</p>
          <p className="truncate text-[12px] text-neutral-500">{pending ? "Working…" : listening ? "Listening — press the mic to stop" : "Reads MAIRO's records. Asks before changing anything."}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-neutral-400">
          <input
            type="checkbox"
            checked={speak}
            onChange={(e) => {
              setSpeak(e.target.checked);
              speakRef.current = e.target.checked;
              if (!e.target.checked) window.speechSynthesis?.cancel();
            }}
            className="accent-[color:var(--color-signal)]"
          />
          Speak replies
        </label>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto max-w-[520px] pt-6 text-center">
            <p className="text-[15px] text-white">What do you want to know?</p>
            <p className="mt-1 text-[13px] text-neutral-500">Subscriptions, revenue, sign-ups, Meta, background jobs, customers, your projects. Anything it can&rsquo;t see, it says.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-[color:var(--mairo-line)] px-3.5 py-2 text-[13px] text-neutral-300 transition hover:border-signal/50 hover:text-white">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[88%] space-y-2 sm:max-w-[78%]`}>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  if (!part.text.trim()) return null;
                  return (
                    <p key={i} className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${m.role === "user" ? "bg-signal/15 text-white ring-1 ring-signal/30" : "bg-[rgba(var(--mairo-fg-rgb),0.06)] text-white"}`}>
                      {part.text}
                    </p>
                  );
                }
                if (!part.type.startsWith("tool-")) return null;
                const tp = part as { type: string; toolCallId: string; state: string; output?: unknown; errorText?: string };
                const name = tp.type.slice(5);
                if (name !== "propose_action") {
                  return (
                    <p key={i} className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mairo-line)] px-2.5 py-1 text-[11.5px] text-neutral-400">
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tp.state === "output-available" ? "bg-signal" : tp.state === "output-error" ? "bg-red-400" : "animate-pulse bg-neutral-400"}`} />
                      {TOOL_LABEL[name] ?? name}
                      {tp.state === "output-error" ? " — failed" : ""}
                    </p>
                  );
                }
                if (tp.state !== "output-available") return <p key={i} className="text-[12px] text-neutral-500">Preparing a proposal…</p>;
                const out = tp.output as ProposalOutput;
                if (!out.ok) return <p key={i} className="rounded-xl border border-red-500/30 px-3 py-2 text-[12.5px] text-red-200">Couldn&rsquo;t propose that: {out.error}</p>;
                const card = cards[tp.toolCallId] ?? { phase: "idle" };
                return (
                  <div key={i} className="rounded-2xl border border-signal/40 bg-signal/[0.06] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-signal">Needs your confirmation</p>
                    <p className="mt-1.5 text-[14px] text-white">{out.summary}</p>
                    <p className="mt-1 text-[12px] text-neutral-500">Nothing has been saved. Confirming adds it to your workspace and the activity log.</p>
                    {card.phase === "done" ? (
                      <p role="status" className="mt-3 text-[13px] text-emerald-300">✓ {card.message}</p>
                    ) : card.phase === "dismissed" ? (
                      <p className="mt-3 text-[13px] text-neutral-500">Dismissed — nothing changed.</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button type="button" disabled={card.phase === "saving"} onClick={() => confirm(tp.toolCallId, out.proposal)} className="min-h-10 rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13px] font-medium disabled:opacity-60">
                          {card.phase === "saving" ? "Saving…" : "Confirm"}
                        </button>
                        <button type="button" disabled={card.phase === "saving"} onClick={() => setCards((c) => ({ ...c, [tp.toolCallId]: { phase: "dismissed" } }))} className="min-h-10 rounded-full border border-[color:var(--mairo-line-lit)] px-4 text-[13px] text-white">
                          Dismiss
                        </button>
                        {card.phase === "error" && <span role="alert" className="text-[12.5px] text-red-300">{card.message}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {status === "submitted" && <p className="text-[12px] text-neutral-500">Thinking…</p>}
        {error && (
          <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[13.5px] text-red-200">
            {error.message || "Something went wrong reaching the assistant."}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-[color:var(--mairo-line)] p-3 sm:p-4"
      >
        {voiceNote && <p className="mb-2 text-[12px] text-amber-200">{voiceNote}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Talk to JARVIS (uses your microphone)"}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition ${listening ? "border-red-400/60 bg-red-500/15 text-red-300" : "border-[color:var(--mairo-line-lit)] text-neutral-300 hover:text-white"}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </button>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Message JARVIS</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Listening…" : "Ask, or say what to add to your projects"}
              className="h-11 w-full rounded-full border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-fg-rgb),0.03)] px-4 text-[14px] text-white placeholder:text-neutral-500 focus:border-signal/60 focus:outline-none"
            />
          </label>
          <button type="submit" disabled={pending || !input.trim()} className="h-11 shrink-0 rounded-full bg-[image:var(--mairo-ramp)] px-5 text-[13.5px] font-medium disabled:opacity-50">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
