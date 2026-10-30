"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { intentOf } from "@/lib/dashboard/intent";

// "What would you like to advertise today?" — the Overview's one box.
//
// Typing here doesn't start a separate chat. What MAIRO has a screen for opens
// that screen with the words carried over (lib/dashboard/intent.ts); anything
// else is a question for the MAIRO assistant, which answers from this
// account's records. Nothing is launched or spent from the box itself.

const STARTERS = [
  { label: "Create an ad for…", fill: "Create an ad for " },
  { label: "How are my ads performing?", send: "How are my ads performing?" },
  { label: "Run my last campaign again", send: "Run my last campaign again" },
  { label: "Why am I not getting more customers?", send: "Why am I not getting more customers?" },
];

export function HomeComposer({ assistantName }: { assistantName: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [going, setGoing] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const go = (value: string) => {
    const t = value.trim();
    if (!t) return;
    const intent = intentOf(t);
    setGoing(intent.kind === "ask" ? `Asking ${assistantName}…` : `${intent.label}…`);
    router.push(intent.href);
  };

  return (
    <section aria-labelledby="composer-title">
      <h2 id="composer-title" className="mb-3 px-1 text-[clamp(19px,2.6vw,22px)] font-semibold tracking-[-0.015em] text-white">
        What would you like to advertise today?
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
        className="rounded-[26px] border p-2 pl-4 transition-colors focus-within:border-[color:var(--mairo-line-lit)]"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.035)" }}
      >
        <label htmlFor="home-composer" className="sr-only">
          What would you like to advertise today?
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="home-composer"
            ref={box}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // Grows with what's typed, up to a few lines.
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                go(text);
              }
            }}
            placeholder="A product, an offer, or a question…"
            enterKeyHint="send"
            // 16px, so a phone doesn't zoom the page when the box is tapped.
            className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 text-white placeholder:text-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || Boolean(going)}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition disabled:opacity-30"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 15.5V4.5M5.5 9 10 4.5 14.5 9" />
            </svg>
          </button>
        </div>
      </form>
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] px-2 text-[12.5px] text-muted">
        {going ?? "MAIRO shows you everything before anything goes live or spends."}
      </p>
      <ul className="mt-1 flex flex-wrap gap-2" aria-label="Things you can ask">
        {STARTERS.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => {
                if (s.send) return go(s.send);
                setText(s.fill ?? "");
                box.current?.focus();
              }}
              className="min-h-10 rounded-full border px-3.5 text-[13px] text-white/85 transition hover:border-[color:var(--mairo-line-lit)] hover:text-white"
              style={{ borderColor: "var(--mairo-line)" }}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
