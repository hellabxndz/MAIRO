"use client";

import { useContext, type ReactNode } from "react";
import { MetaMark } from "@/components/mairo/marks";
import { DemoContext, Go, Pill, type PillTone } from "./kit";

// The top of the Overview: who's here, which business and ad account MAIRO
// is working in, and what the AI team is doing right now — each from a
// record, never a guess.

export type ConsoleHeaderData = {
  greeting: string;
  subline: string;
  business: string;
  adAccount: { label: string; state: "connected" | "attention" | "none"; href?: string | null };
  ai: { label: string; tone: PillTone; running: boolean; detail: string | null; href?: string | null };
};

const ACCOUNT_TONE = { connected: "live", attention: "warn", none: "muted" } as const;

export function ConsoleHeader({ data, right }: { data: ConsoleHeaderData; right?: ReactNode }) {
  const initial = (data.business || "M").trim().charAt(0).toUpperCase();
  // A demonstration of the Overview isn't the page's own title.
  const Title = useContext(DemoContext) ? "p" : "h1";
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Title className="text-[clamp(26px,3.2vw,38px)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">{data.greeting}</Title>
          <p className="mt-1.5 text-[14.5px] text-muted">{data.subline}</p>
        </div>
        {right}
      </div>
      <dl className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5 rounded-full border py-1 pl-1 pr-3.5" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.03)" }}>
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
            {initial}
          </span>
          <dt className="sr-only">Business</dt>
          <dd className="truncate text-[13px] font-medium text-white">{data.business}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-2" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.03)" }}>
          <span aria-hidden className="h-4 w-4 shrink-0">
            <MetaMark />
          </span>
          <dt className="sr-only">Ad account</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <Go href={data.adAccount.href} className="truncate text-[13px] text-white/90 hover:text-white">
              {data.adAccount.label}
            </Go>
            <Pill tone={ACCOUNT_TONE[data.adAccount.state]} dot>
              {data.adAccount.state === "connected" ? "Connected" : data.adAccount.state === "attention" ? "Needs attention" : "Not connected"}
            </Pill>
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-3" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.03)" }}>
          <dt className="text-[12px] text-faint">MAIRO AI</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <Pill tone={data.ai.tone} dot>
              {data.ai.label}
            </Pill>
            {data.ai.detail && (
              <Go href={data.ai.href} className="hidden truncate text-[12px] text-muted hover:text-white sm:inline">
                {data.ai.detail}
              </Go>
            )}
          </dd>
        </div>
      </dl>
    </header>
  );
}
