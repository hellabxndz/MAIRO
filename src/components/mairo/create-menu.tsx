"use client";

import Link from "next/link";
import { useState } from "react";
import { TellMairo } from "@/app/dashboard/mission/mission-client";
import { Modal } from "./overlay";

// "+ Create": one button for everything a customer can start, instead of
// creation buttons scattered across every screen. Social posting appears
// only on Scale.

type View = "menu" | "tell" | "promotion";

const ICON: Record<string, string> = {
  campaign: "M3.5 15.5V9M8.5 15.5V5.5M13.5 15.5v-4M17.5 15.5V7.5",
  creative: "M3 4h14v12H3z M3.6 13.6l3.8-3.8 3.4 3.4 2.4-2 3.2 3.2",
  promotion: "M3.5 10.5l7-7h6v6l-7 7z M13 7h.01",
  social: "M4 5.5h12v9H4z M4 8.5h12 M7.5 3.5v3 M12.5 3.5v3",
  tell: "M4 4.5h12v8H8l-4 3z",
};

export function CreateMenu({ scale, variant = "sidebar" }: { scale: boolean; variant?: "sidebar" | "bar" }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const close = () => {
    setOpen(false);
    setView("menu");
  };

  const row = (key: string, label: string, sub: string, action: { href: string } | { view: View }) => {
    const inner = (
      <>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-blue-bright" style={{ background: "rgba(61,125,255,0.12)" }}>
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[key]} /></svg>
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-[15px] font-medium text-white">{label}</span>
          <span className="block text-[12.5px] text-muted">{sub}</span>
        </span>
      </>
    );
    const cls = "flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 transition hover:bg-white/[0.05]";
    return "href" in action ? (
      <Link key={key} href={action.href} onClick={close} className={cls}>{inner}</Link>
    ) : (
      <button key={key} type="button" onClick={() => setView(action.view)} className={cls}>{inner}</button>
    );
  };

  return (
    <>
      {variant === "sidebar" ? (
        <button type="button" onClick={() => setOpen(true)} data-tour="create"
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-white transition hover:brightness-110"
          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}>
          <span aria-hidden className="text-[16px] leading-none">+</span> Create
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Create"
          className="relative flex flex-col items-center gap-1 px-1 py-2">
          <span className="-mt-5 flex h-11 w-11 items-center justify-center rounded-full text-[22px] leading-none text-white" style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }} aria-hidden>+</span>
          <span className="text-[10px] leading-none text-faint">Create</span>
        </button>
      )}
      <Modal open={open} onClose={close} title={view === "menu" ? "Create" : view === "promotion" ? "Add a promotion" : "Tell MAIRO something"}>
        {view === "menu" ? (
          <nav aria-label="Create" className="-mx-2 space-y-1">
            {row("campaign", "Create campaign", "Tell MAIRO the goal; it builds the campaign for you to confirm.", { href: "/dashboard/create" })}
            {row("creative", "Create creative", "An ad image or video idea, made with AI.", { href: "/dashboard/creative-studio" })}
            {row("promotion", "Add promotion", "A sale, an offer, a launch — MAIRO plans around it.", scale ? { href: "/dashboard/social/promotions" } : { view: "promotion" })}
            {scale && row("social", "Create social post", "Plan a post for Instagram or Facebook.", { href: "/dashboard/social/calendar" })}
            {row("tell", "Tell MAIRO something", "Something sold out, a new goal, news about your business.", { view: "tell" })}
          </nav>
        ) : view === "promotion" ? (
          <>
            <p className="mb-3 text-[13.5px] text-muted">Say what it is and when. MAIRO plans when to mention it, whether your ads should change, and urgency near the end.</p>
            <TellMairo initialText="We're running a promotion: " placeholder={`e.g. "20% off all hoodies this weekend"`} />
          </>
        ) : (
          <TellMairo />
        )}
      </Modal>
    </>
  );
}

/** "✨ Ask MAIRO": opens the assistant panel from anywhere. */
export function AskMairoButton({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("mairo:open-assistant"))}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium text-white transition hover:border-[color:var(--mairo-line-lit)] ${compact ? "px-2.5" : ""}`}
      style={{ borderColor: "var(--mairo-line)", background: "rgba(124,92,255,0.12)" }}
    >
      <span aria-hidden>✨</span>
      {compact ? <span className="sr-only">Ask {name}</span> : <>Ask {name}</>}
    </button>
  );
}
