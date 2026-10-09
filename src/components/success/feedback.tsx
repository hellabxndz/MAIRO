"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import type { FeedbackEasier, FeedbackKind } from "@/generated/prisma/enums";
import { Drawer } from "@/components/mairo/overlay";
import { actionClass, quietClass } from "@/components/mairo/action-styles";
import { pulseLaterAction, sendFeedbackAction } from "@/lib/actions/feedback-actions";

// Telling the MAIRO team something — from anywhere, in a sentence. Read by
// people, not by a model; nothing here changes a campaign.

const PULSE_QUESTION = "Is MAIRO making advertising easier for your business?";
const EASIER: { value: FeedbackEasier; label: string }[] = [
  { value: "YES", label: "Yes" },
  { value: "SOMEWHAT", label: "Somewhat" },
  { value: "NO", label: "Not yet" },
];
const KINDS: { value: FeedbackKind; label: string; placeholder: string }[] = [
  { value: "PROBLEM", label: "Something's wrong", placeholder: "What happened, and on which screen?" },
  { value: "CONFUSING", label: "Something's confusing", placeholder: "What didn't make sense?" },
  { value: "IDEA", label: "An idea", placeholder: "What would make MAIRO more useful for you?" },
];

const chip = (on: boolean) =>
  `min-h-[38px] rounded-full border px-4 text-[13px] transition ${
    on ? "border-transparent bg-[image:var(--mairo-ramp)] text-white" : "border-[color:var(--mairo-line)] text-white/80 hover:border-[color:var(--mairo-line-lit)] hover:text-white"
  }`;

function FeedbackForm({ onDone }: { onDone?: () => void }) {
  const page = usePathname();
  const [kind, setKind] = useState<FeedbackKind>("PROBLEM");
  const [easier, setEasier] = useState<FeedbackEasier | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const chosen = KINDS.find((k) => k.value === kind)!;

  if (sent) {
    return (
      <div>
        <p className="text-[15px] text-white">Thank you — the MAIRO team reads every one of these.</p>
        <p className="mt-1.5 text-[13px] text-muted">If something&rsquo;s broken, they&rsquo;ll be in touch.</p>
        {onDone && (
          <button type="button" onClick={onDone} className={`mt-5 ${quietClass}`}>
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          // The pulse answer, if given, travels on its own so it's counted
          // as an answer whatever else was said.
          if (easier) {
            const r = await sendFeedbackAction({ kind: "PULSE", easier, text: null, page });
            if (!r.ok) return setError(r.error ?? "Couldn't send that.");
          }
          if (text.trim()) {
            const r = await sendFeedbackAction({ kind, text, page });
            if (!r.ok) return setError(r.error ?? "Couldn't send that.");
          } else if (!easier) {
            return setError("Pick an answer or write a few words.");
          }
          setSent(true);
        });
      }}
    >
      <fieldset>
        <legend className="text-[14px] text-white">{PULSE_QUESTION}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {EASIER.map((o) => (
            <button key={o.value} type="button" aria-pressed={easier === o.value} onClick={() => setEasier(easier === o.value ? null : o.value)} className={chip(easier === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-[14px] text-white">Anything to tell the MAIRO team?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)} className={chip(kind === k.value)}>
              {k.label}
            </button>
          ))}
        </div>
        <label htmlFor="feedback-text" className="sr-only">
          {chosen.placeholder}
        </label>
        <textarea
          id="feedback-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={chosen.placeholder}
          rows={4}
          maxLength={4000}
          className="mt-3 w-full rounded-2xl border border-[color:var(--mairo-line)] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder:text-faint focus:border-[color:var(--mairo-line-lit)]"
        />
      </fieldset>
      {error && <p className="text-[13px] text-red-300" role="alert">{error}</p>}
      <button type="submit" disabled={pending} className={actionClass}>
        {pending ? "Sending…" : "Send to the MAIRO team"}
      </button>
    </form>
  );
}

/** "Feedback" — in the sidebar and on Settings. */
export function FeedbackButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "w-full rounded-xl px-3 py-[7px] text-left text-[13px] text-faint transition-colors hover:bg-white/[0.04] hover:text-white"}
      >
        Feedback
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Tell the MAIRO team">
        <FeedbackForm onDone={() => setOpen(false)} />
      </Drawer>
    </>
  );
}

/**
 * The monthly pulse on the Overview. One tap answers it; a comment is
 * optional; "Ask me later" puts it away for a week.
 */
export function PulseCard() {
  const page = usePathname();
  const [easier, setEasier] = useState<FeedbackEasier | null>(null);
  const [text, setText] = useState("");
  const [done, setDone] = useState<"sent" | "later" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done === "later") return null;
  if (done === "sent") {
    return (
      <section className="rounded-[28px] p-6 sm:p-7" style={{ background: "linear-gradient(180deg, rgba(124,92,255,0.10), rgba(255,255,255,0.015))" }}>
        <p className="text-[15px] text-white">Thank you. The MAIRO team reads every answer.</p>
      </section>
    );
  }

  const send = () =>
    start(async () => {
      if (!easier) return;
      const r = await sendFeedbackAction({ kind: "PULSE", easier, text, page });
      if (!r.ok) return setError(r.error ?? "Couldn't send that.");
      setDone("sent");
    });

  return (
    <section aria-labelledby="pulse" className="rounded-[28px] p-6 sm:p-7" style={{ background: "linear-gradient(180deg, rgba(124,92,255,0.10), rgba(255,255,255,0.015))" }}>
      <h2 id="pulse" className="text-[16px] font-medium text-white">{PULSE_QUESTION}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {EASIER.map((o) => (
          <button key={o.value} type="button" aria-pressed={easier === o.value} onClick={() => setEasier(o.value)} className={chip(easier === o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {easier && (
        <div className="mt-4">
          <label htmlFor="pulse-text" className="text-[13px] text-muted">
            {easier === "YES" ? "What's been most useful? (optional)" : "What would make it easier? (optional)"}
          </label>
          <textarea
            id="pulse-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={4000}
            className="mt-2 w-full rounded-2xl border border-[color:var(--mairo-line)] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none focus:border-[color:var(--mairo-line-lit)]"
          />
          <button type="button" onClick={send} disabled={pending} className={`mt-3 ${actionClass}`}>
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-red-300" role="alert">{error}</p>}
      {!easier && (
        <button
          type="button"
          onClick={() => start(async () => {
            await pulseLaterAction();
            setDone("later");
          })}
          className="mt-3 text-[12.5px] text-faint hover:text-white"
        >
          Ask me later
        </button>
      )}
    </section>
  );
}
