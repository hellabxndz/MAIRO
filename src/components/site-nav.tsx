"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Floating rather than fixed to the top edge: the bar sits inset from the
// viewport so the starfield runs behind and around it, which is what stops it
// reading as a normal website header.
//
// It stays transparent until you scroll. Over the hero there is nothing behind
// the links but sky, and a panel there would cut the one full-bleed view of the
// backdrop the page gets.

const LINKS = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const floating = scrolled || open;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6 sm:pt-6">
      <div
        className={`pointer-events-auto mx-auto flex max-w-[1500px] items-center justify-between rounded-full px-5 py-3 transition-all duration-500 sm:px-7 ${
          floating
            ? "border border-white/[0.08] bg-black/55 backdrop-blur-xl"
            : "border border-transparent"
        }`}
      >
        <Link
          href="/"
          className="text-[13px] font-light tracking-[0.34em] text-white transition hover:text-neutral-300"
        >
          MAIRO
        </Link>

        <nav className="hidden items-center gap-11 text-[11px] uppercase tracking-[0.2em] text-neutral-500 md:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-5">
          <Link
            href="/sign-in"
            className="hidden text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition hover:text-white sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-white px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] text-black transition hover:bg-neutral-200"
          >
            Try MAIRO
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 md:hidden"
          >
            <span
              className={`block h-px w-5 bg-white transition ${open ? "translate-y-[3px] rotate-45" : ""}`}
            />
            <span
              className={`block h-px w-5 bg-white transition ${open ? "-translate-y-[3px] -rotate-45" : ""}`}
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="pointer-events-auto mx-auto mt-2 max-w-[1500px] rounded-3xl border border-white/[0.08] bg-black/85 px-7 py-7 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-6 text-xs uppercase tracking-[0.2em] text-neutral-400">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="transition hover:text-white"
              >
                {link.label}
              </a>
            ))}
            <Link href="/sign-in" onClick={() => setOpen(false)} className="transition hover:text-white">
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
