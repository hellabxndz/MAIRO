"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/wordmark";

// The public top bar: How It Works, Features, Pricing and Resources, then
// Sign In and Get My Free Plan. Sticky, on MAIRO's night with a hairline once
// the page scrolls. Resources holds the free tools and the reference pages so
// the main bar stays on the signup journey. On a phone everything folds into
// one menu. Links are absolute ("/pricing") so they work from any page.
//
// On the narrowest phones (under 375px) the bar's own call to action steps
// aside: the logo, the button and the menu don't fit side by side, and the
// same button is in the menu and directly under the bar in every hero.

const MAIN = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

const resourcesFor = (toolsLive: boolean) => [
  ...(toolsLive ? [{ href: "/tools", label: "Free advertising tools", hint: "Calculators, checkers and planners — no account" }] : []),
  { href: "/#film", label: "Watch MAIRO in action", hint: "The product, start to finish" },
  { href: "/#solutions", label: "Who it's for", hint: "Local services, online stores, teams" },
  { href: "/#control", label: "Security & control", hint: "Your account, your approval, your money" },
  { href: "/#faq", label: "FAQ", hint: "Plain answers before you sign up" },
  { href: "/help", label: "Help center", hint: "How MAIRO works, credits, approvals, billing" },
  { href: "/pricing", label: "More than one business?", hint: "MAIRO Scale covers up to 3 Meta ad accounts" },
];

export function LandingNav({
  toolsLive = false,
  cta = { href: "/preview", label: "Get My Free Plan" },
}: {
  toolsLive?: boolean;
  cta?: { href: string; label: string };
  /** Kept for older callers; the bar is always on the night palette now. */
  productHref?: string;
  dark?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(false);
  const resRef = useRef<HTMLDivElement>(null);
  const RES = resourcesFor(toolsLive);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${scrolled || open ? "border-b border-white/[0.07] bg-[#0a0a0a]/90 backdrop-blur-md" : "bg-transparent"}`}>
      <nav aria-label="Main" className="mx-auto flex h-[64px] max-w-[1360px] items-center justify-between gap-2 px-4 sm:h-[72px] sm:px-8 lg:px-10">
        <div className="flex min-w-0 items-center gap-[clamp(32px,6vw,96px)]">
          <Wordmark className="text-[16.5px] sm:text-[19px]" />
          <div className="hidden items-center gap-7 whitespace-nowrap text-[14px] font-medium text-white/80 lg:flex xl:gap-9">
            {MAIN.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </Link>
            ))}
            <div ref={resRef} className="relative">
              <button type="button" aria-expanded={res} aria-controls="nav-resources" onClick={() => setRes((v) => !v)} className="inline-flex items-center gap-1 transition-colors hover:text-white">
                Resources
                <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 transition ${res ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
              {res && (
                <ul id="nav-resources" className="absolute left-1/2 top-[calc(100%+14px)] w-[320px] -translate-x-1/2 rounded-2xl border p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]" style={{ borderColor: "var(--mairo-line)", background: "#161616" }}>
                  {RES.map((r) => (
                    <li key={r.href}>
                      <Link href={r.href} onClick={() => setRes(false)} className="block rounded-xl px-3 py-2.5 transition hover:bg-white/[0.05]">
                        <span className="block text-[13.5px] font-medium text-white">{r.label}</span>
                        <span className="block whitespace-normal text-[12px] font-normal text-white/50">{r.hint}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <Link href="/sign-in" className="hidden min-h-[44px] items-center whitespace-nowrap rounded-full border border-white/12 px-5 text-[13.5px] font-medium text-white/90 transition hover:border-white/30 hover:text-white sm:inline-flex">
            Sign In
          </Link>
          <Link href={cta.href} className="hidden min-h-[44px] items-center whitespace-nowrap rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13.5px] font-semibold text-black shadow-[var(--mairo-glow-key)] transition hover:brightness-110 min-[375px]:inline-flex sm:px-5">
            {cta.label}
          </Link>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="nav-mobile" aria-label={open ? "Close menu" : "Open menu"} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white lg:hidden">
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div id="nav-mobile" className="max-h-[calc(100dvh-64px)] overflow-y-auto overscroll-contain border-t border-white/[0.07] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-h-[calc(100dvh-72px)] sm:px-8 lg:hidden">
          <ul className="space-y-1 pt-3">
            {[...MAIN, ...RES.map((r) => ({ href: r.href, label: r.label })), { href: "/sign-in", label: "Sign In" }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-[15px] text-white/85 hover:bg-white/[0.04]">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/preview" onClick={() => setOpen(false)} className="mt-3 flex min-h-[50px] items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] text-[15px] font-semibold text-black">
            Get My Free Plan
          </Link>
        </div>
      )}
    </header>
  );
}
