"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#agents", label: "Specialists" },
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

  return (
    <header
      className={`fixed top-0 z-40 w-full transition-all duration-500 ${
        scrolled || open
          ? "border-b border-white/10 bg-black/70 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="text-sm font-medium tracking-[0.2em] text-white">
          MAIRO
        </Link>

        <nav className="hidden items-center gap-10 text-xs uppercase tracking-[0.15em] text-neutral-400 sm:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </a>
          ))}
          <Link href="/sign-in" className="transition hover:text-white">
            Sign in
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/sign-up"
            className="group flex items-center gap-2 border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white transition hover:border-white/50"
          >
            Get started
            <span className="transition group-hover:translate-x-0.5">→</span>
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 sm:hidden"
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
        <div className="border-t border-white/10 px-6 py-6 sm:hidden">
          <nav className="flex flex-col gap-5 text-sm uppercase tracking-[0.15em] text-neutral-300">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="hover:text-white">
                {link.label}
              </a>
            ))}
            <Link href="/sign-in" onClick={() => setOpen(false)} className="hover:text-white">
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
