"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";

// The landing page's top bar: Product, Pricing, Resources, Log in, and the
// one call to action. On a phone the links fold into a menu.

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#ai-team", label: "AI Team" },
  { href: "#performance-coach", label: "Results" },
  { href: "#pricing", label: "Pricing" },
];

const RESOURCES = [
  { href: "#product-preview", label: "See MAIRO at work" },
  { href: "#why-mairo", label: "What MAIRO does" },
  { href: "#free-plan", label: "Your free plan" },
  { href: "#trust", label: "Security and budget control" },
  { href: "#integrations", label: "Integrations" },
  { href: "#faq", label: "FAQ" },
  { href: "/for-freelancers", label: "Sign up as a freelancer or agency" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled || open ? "border-b border-white/[0.06] bg-field-3/80 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-[clamp(40px,10vw,190px)]">
          <Wordmark />

          <div className="hidden items-center gap-7 whitespace-nowrap xl:gap-9 text-[14px] font-medium text-white/90 lg:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </a>
            ))}
            <div className="relative" onMouseLeave={() => setResources(false)}>
              <button
                type="button"
                onClick={() => setResources((v) => !v)}
                onMouseEnter={() => setResources(true)}
                aria-expanded={resources}
                className="flex items-center gap-1 transition-colors hover:text-white"
              >
                Resources
                <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
                  <path d="m3 4.5 3 3 3-3" />
                </svg>
              </button>
              {resources && (
                <div className="absolute left-1/2 top-full w-60 -translate-x-1/2 pt-3">
                  <ul className="rounded-xl border border-white/10 bg-paper p-1.5 shadow-2xl">
                    {RESOURCES.map((r) => (
                      <li key={r.href}>
                        <Link href={r.href} className="block rounded-lg px-3 py-2 text-[13px] text-white/75 hover:bg-white/[0.05] hover:text-white">
                          {r.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/sign-in" className="hidden rounded-full border border-white/12 bg-white/[0.03] px-5 py-2.5 text-[13.5px] font-medium text-white/90 backdrop-blur transition hover:border-white/30 hover:text-white sm:inline-block whitespace-nowrap">
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="whitespace-nowrap rounded-full bg-gradient-to-r from-[#3b6bff] to-[#8b4dfb] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_30px_-6px_rgba(79,125,255,0.9)] transition hover:brightness-110"
          >
            Get My Free Plan <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white lg:hidden"
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-white/[0.06] px-5 pb-5 lg:hidden">
          <ul className="space-y-1 pt-3">
            {[...LINKS, ...RESOURCES, { href: "/sign-in", label: "Sign In" }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-[15px] text-white/85 hover:bg-white/[0.04]">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
