"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// The landing page's top bar: Product, Pricing, Resources, Log in, and the
// one call to action. On a phone the links fold into a menu.

const LINKS = [
  { href: "#how-it-works", label: "Product" },
  { href: "#pricing", label: "Pricing" },
];

const RESOURCES = [
  { href: "/for-freelancers", label: "For freelancers & agencies" },
  { href: "#decisions", label: "How Mairo decides" },
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
        scrolled || open ? "border-b border-white/[0.06] bg-[#06060d]/85 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-[20px] font-semibold tracking-[-0.03em] text-white">
          Mairo
        </Link>

        <div className="hidden items-center gap-8 text-[14px] text-white/75 md:flex">
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
              Resources <span aria-hidden className="text-[10px]">▾</span>
            </button>
            {resources && (
              <div className="absolute left-1/2 top-full w-60 -translate-x-1/2 pt-3">
                <ul className="rounded-xl border border-white/10 bg-[#0c0c17] p-1.5 shadow-2xl">
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

        <div className="flex items-center gap-2.5">
          <Link href="/sign-in" className="hidden rounded-full border border-white/15 px-4 py-2 text-[13px] text-white/85 transition hover:border-white/30 hover:text-white sm:inline-block">
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-gradient-to-r from-[#7c5cff] to-[#a855f7] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_-8px_rgba(139,92,246,0.8)] transition hover:brightness-110"
          >
            Start free trial <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white md:hidden"
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-white/[0.06] px-5 pb-5 md:hidden">
          <ul className="space-y-1 pt-3">
            {[...LINKS, ...RESOURCES, { href: "/sign-in", label: "Log in" }].map((l) => (
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
