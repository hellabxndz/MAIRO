"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/wordmark";

// The public top bar for every page but the homepage (v3 "Signal", the same
// look as the homepage's HomeNav): near-black with a hairline, sentence case,
// one white call to action. Resources holds the free tools and the reference
// pages so the bar stays on the signup journey; on a phone everything folds
// into one menu. Links are absolute ("/pricing") so they work from any page,
// and every anchor names a section that exists.

const MAIN = [
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

const resourcesFor = (toolsLive: boolean) => [
  ...(toolsLive ? [{ href: "/tools", label: "Free advertising tools", hint: "Calculators, checkers and planners — no account" }] : []),
  { href: "/#one-mairo", label: "One MAIRO", hint: "Ask for what you want; MAIRO prepares it for approval" },
  { href: "/solutions/local-services", label: "Who it's for", hint: "Local services, appointments, online stores" },
  { href: "/#control", label: "You stay in control", hint: "Your account, your approval, your limits" },
  { href: "/pricing#faq", label: "FAQ", hint: "Plain answers before you sign up" },
  { href: "/help", label: "Help center", hint: "How MAIRO works, approvals, billing" },
];

export function LandingNav({
  toolsLive = false,
  cta = { href: "/preview", label: "Start free" },
}: {
  toolsLive?: boolean;
  cta?: { href: string; label: string };
  /** Kept for older callers; the bar is always on the night palette now. */
  productHref?: string;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(false);
  const resRef = useRef<HTMLDivElement>(null);
  const RES = resourcesFor(toolsLive);

  useEffect(() => {
    if (!res) return;
    const onDown = (e: MouseEvent) => {
      if (resRef.current && !resRef.current.contains(e.target as Node)) setRes(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setRes(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [res]);

  const link = "inline-flex min-h-11 items-center px-3 text-[14px] text-white/65 transition hover:text-white";

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[color:var(--v3-line)] bg-[color:var(--v3-ink)]/95">
      <nav aria-label="Main" className="mx-auto flex h-[72px] w-full max-w-[1320px] items-center gap-4 px-5 sm:px-10 lg:px-16">
        <Wordmark href="/" className="text-[15px]" />
        <div className="ml-auto hidden items-center gap-1 lg:flex">
          {MAIN.map((l) => (
            <Link key={l.href} href={l.href} className={link}>
              {l.label}
            </Link>
          ))}
          <div ref={resRef} className="relative">
            <button type="button" aria-expanded={res} aria-controls="nav-resources" onClick={() => setRes((v) => !v)} className={`${link} gap-1`}>
              Resources
              <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 transition ${res ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
            {res && (
              <ul id="nav-resources" className="absolute right-0 top-[calc(100%+12px)] w-[320px] rounded-[20px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
                {RES.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} onClick={() => setRes(false)} className="block rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]">
                      <span className="block text-[13.5px] font-medium text-white">{r.label}</span>
                      <span className="block text-[12px] text-[color:var(--v3-text-3)]">{r.hint}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-2">
          <Link href="/sign-in" className="hidden min-h-11 items-center px-3 text-[14px] text-white/80 transition hover:text-white sm:inline-flex">
            Sign in
          </Link>
          <Link href={cta.href} className="cine-cta hidden min-h-10 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-semibold min-[360px]:inline-flex">
            {cta.label}
          </Link>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="nav-mobile" aria-label={open ? "Close menu" : "Open menu"} className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--v3-line-strong)] text-white lg:hidden">
            <span aria-hidden className="text-[15px]">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div id="nav-mobile" className="max-h-[calc(100dvh-72px)] overflow-y-auto overscroll-contain border-t border-[color:var(--v3-line)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 lg:hidden">
          <ul className="divide-y divide-[color:var(--v3-line)] pt-2">
            {[...MAIN, ...RES.map((r) => ({ href: r.href, label: r.label })), { href: "/sign-in", label: "Sign in" }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-[52px] items-center text-[16px] text-white/85 hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={cta.href} onClick={() => setOpen(false)} className="cine-cta mt-4 flex min-h-[52px] items-center justify-center rounded-full text-[15px] font-semibold">
            {cta.label}
          </Link>
        </div>
      )}
    </header>
  );
}
