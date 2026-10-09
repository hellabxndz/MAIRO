"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Ask your AI team" on the home screen: one box, plain questions. The
// assistant picks the right specialist's tools itself — nobody chooses an
// agent — and answers from the account's real records.

export const SUGGESTED = [
  "How are my ads doing?",
  "What is my team working on?",
  "Why am I not getting customers?",
  "Should I change my campaign?",
  "How much money have I spent?",
  "What's the next best thing to improve?",
];

export function AskTeam({ name }: { name: string }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const ask = (text: string) => {
    const t = text.trim();
    if (t) router.push(`/dashboard/agents?ask=${encodeURIComponent(t)}`);
  };
  return (
    <section aria-labelledby="ask-team" className="rounded-[28px] border border-[color:var(--mairo-line-lit)] p-5 sm:p-6" style={{ background: "linear-gradient(160deg, rgba(124,92,255,0.08), rgba(var(--mairo-fg-rgb),0.01) 70%)" }}>
      <h2 id="ask-team" className="text-[15px] font-semibold text-white">Ask your AI team</h2>
      <p className="mt-1 text-[13px] text-muted">Ask in your own words. {name} answers from your real campaigns and business, and brings in the right specialist.</p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor="ask-team-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-team-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Why am I not getting customers?"
          className="min-h-[44px] min-w-0 flex-1 rounded-full border border-[color:var(--mairo-line)] bg-paper px-4 text-[14px] text-white placeholder:text-faint focus:border-[color:var(--mairo-line-lit)] focus:outline-none"
        />
        <button type="submit" className="min-h-[44px] rounded-full bg-[image:var(--mairo-ramp)] px-5 text-[13.5px] font-medium text-white disabled:opacity-60" disabled={!q.trim()}>
          Ask
        </button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Questions you can ask">
        {SUGGESTED.map((s) => (
          <li key={s}>
            <button type="button" onClick={() => ask(s)} className="rounded-full border border-[color:var(--mairo-line)] px-3 py-1.5 text-[12.5px] text-white/85 transition hover:border-[color:var(--mairo-line-lit)] hover:text-white">
              {s}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
