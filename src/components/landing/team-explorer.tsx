"use client";

import { useRef, useState, type Ref } from "react";
import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT, AGENTS } from "@/lib/team/agents";
import { AgentIcon } from "@/components/team/agent-ui";

// The landing page's AI team: how the specialties hand work to each other —
// with your approval as a step of its own and Budget Guardian guarding every
// step — and, for whichever one a visitor picks, what it does, how that
// helps the business, what it works from and when it waits for the owner.
// All of it comes from the same registry the product's AI Team screen uses,
// so the page can't promise what the product doesn't do.

type Step = { role: AgentRole; label: string } | { owner: true; label: string } | { launch: true; label: string };

const FLOW: Step[] = [
  { role: "STRATEGIST", label: "Plans" },
  { role: "AUDIENCE", label: "Finds who to reach" },
  { role: "CREATIVE", label: "Makes the ads" },
  { role: "ARCHITECT", label: "Builds it, switched off" },
  { owner: true, label: "You approve" },
  { launch: true, label: "Launches on Meta" },
  { role: "ANALYST", label: "Reads results daily" },
  { role: "OPTIMIZER", label: "Proposes improvements" },
  { role: "GROWTH", label: "Looks for room to grow" },
];

function Detail({ role, panelRef }: { role: AgentRole; panelRef: Ref<HTMLDivElement> }) {
  const a = AGENT[role];
  return (
    <div ref={panelRef} aria-live="polite" className="scroll-mt-24 rounded-[24px] border border-white/10 bg-paper p-6 shadow-[0_30px_80px_-40px_rgba(91,63,224,0.45)] sm:p-7">
      <div className="flex items-center gap-3">
        <AgentIcon role={role} size={48} />
        <div className="min-w-0">
          <p className="text-[19px] font-semibold tracking-[-0.01em] text-white">{a.name}</p>
          <p className="text-[13.5px] text-violet-bright">{a.purpose}</p>
        </div>
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-white/85">{a.helps}</p>
      <dl className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright">What it does</dt>
          <dd>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-white/75">
              {a.does.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-bright" />
                  {d}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright">What it works from</dt>
          <dd>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-white/75">
              {a.uses.map((u) => (
                <li key={u} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-bright" />
                  {u}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="rounded-2xl bg-amber-400/[0.08] p-4 sm:col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">When you approve</dt>
          <dd className="mt-1.5 text-[13.5px] leading-relaxed text-white/85">
            {a.asks.length ? a.asks.join(". ") + "." : "Nothing to approve — it only reads your results and reports on them."}
            {a.mayDo.length > 0 && (
              <span className="mt-1 block text-[12.5px] text-muted">
                On its own, within the limits you set: {a.mayDo.map((m) => m.charAt(0).toLowerCase() + m.slice(1)).join("; ")}.
              </span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-[12px] text-faint">
        {a.periodic ? "Checks once a day, and when you open MAIRO — not every second." : "Works when there's something to do: a plan to write, ads to make, a campaign to build."}
      </p>
    </div>
  );
}

export function TeamExplorer() {
  const [selected, setSelected] = useState<AgentRole>("STRATEGIST");
  const panel = useRef<HTMLDivElement>(null);
  // On a phone the details sit below the list; bring them into view when
  // they'd otherwise change off-screen.
  const pick = (role: AgentRole) => {
    setSelected(role);
    const el = panel.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.7 || top < 72) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    }
  };

  return (
    <div className="mt-12">
      {/* How the work moves — each specialty is a button. */}
      <div className="rounded-[28px] border border-white/10 bg-paper/80 p-5 sm:p-7">
        <p className="text-[13px] font-semibold text-white">How your team works together</p>
        <p className="mt-1 text-[12px] text-muted sm:hidden">Swipe to follow the work →</p>
        <ol className="-mx-5 mt-4 flex snap-x items-center gap-x-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-y-3 sm:overflow-visible sm:px-0 sm:pb-0" aria-label="How the specialties hand work to each other">
          {FLOW.map((s, i) => {
            const last = i === FLOW.length - 1;
            const body =
              "role" in s ? (
                <button
                  type="button"
                  onClick={() => pick(s.role)}
                  aria-pressed={selected === s.role}
                  className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-left transition ${selected === s.role ? "border-[color:var(--mairo-line-lit)] bg-violet/[0.08]" : "border-white/10 hover:border-[color:var(--mairo-line-lit)]"}`}
                >
                  <AgentIcon role={s.role} size={26} />
                  <span className="text-[12.5px] leading-tight">
                    <span className="block font-semibold text-white">{AGENT[s.role].name}</span>
                    <span className="block text-muted">{s.label}</span>
                  </span>
                </button>
              ) : "owner" in s ? (
                <span className="flex items-center gap-2 rounded-full bg-amber-400/15 px-3.5 py-2 text-[12.5px] font-semibold text-amber-200">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M3 8.5l3 3 7-7" />
                  </svg>
                  {s.label}
                </span>
              ) : (
                <span className="rounded-full bg-white/[0.06] px-3.5 py-2 text-[12.5px] font-medium text-white">{s.label}</span>
              );
            return (
              <li key={i} className="flex shrink-0 snap-start items-center gap-2">
                {body}
                {!last && (
                  <svg aria-hidden viewBox="0 0 16 10" className="h-2.5 w-4 text-violet-bright/60">
                    <path d="M0 5h13m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                )}
              </li>
            );
          })}
        </ol>
        {/* Budget Guardian runs under every step. */}
        <button
          type="button"
          onClick={() => pick("GUARDIAN")}
          aria-pressed={selected === "GUARDIAN"}
          className={`mt-5 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${selected === "GUARDIAN" ? "border-live/50 bg-live/[0.08]" : "border-live/25 bg-live/[0.04] hover:border-live/50"}`}
        >
          <AgentIcon role="GUARDIAN" size={30} />
          <span className="min-w-0 text-[13px] leading-snug">
            <span className="font-semibold text-live">Budget Guardian protects every step</span>
            <span className="block text-muted">Checks every proposed change and what you spend against the limits you set — and never raises your total budget without you.</span>
          </span>
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div>
          <p className="mb-3 text-[13px] text-muted">Pick a specialty to see what it does for you.</p>
          <ul className="grid grid-cols-1 gap-2.5 min-[440px]:grid-cols-2" aria-label="Your eight AI specialties">
            {AGENTS.map((a) => (
              <li key={a.role}>
                <button
                  type="button"
                  onClick={() => pick(a.role)}
                  aria-pressed={selected === a.role}
                  className={`flex h-full w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${selected === a.role ? "border-[color:var(--mairo-line-lit)] bg-violet/[0.07] shadow-[0_14px_30px_-20px_rgba(91,63,224,0.6)]" : "border-white/10 bg-paper hover:border-[color:var(--mairo-line-lit)]"}`}
                >
                  <AgentIcon role={a.role} size={34} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white">{a.name}</span>
                    <span className="block text-[12.5px] leading-snug text-muted">{a.specialty}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <Detail role={selected} panelRef={panel} />
      </div>
    </div>
  );
}
