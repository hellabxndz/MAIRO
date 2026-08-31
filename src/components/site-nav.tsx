"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-40 w-full transition-all duration-500 ${
        scrolled ? "border-b border-white/10 bg-black/70 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="text-sm font-medium tracking-[0.2em] text-white">
          MAIRO
        </Link>
        <nav className="hidden items-center gap-10 text-xs uppercase tracking-[0.15em] text-neutral-400 sm:flex">
          <a href="#how-it-works" className="transition hover:text-white">
            How it works
          </a>
          <a href="#agents" className="transition hover:text-white">
            Specialists
          </a>
          <Link href="/sign-in" className="transition hover:text-white">
            Sign in
          </Link>
        </nav>
        <Link
          href="/sign-up"
          className="group flex items-center gap-2 border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white transition hover:border-white/50"
        >
          Get started
          <span className="transition group-hover:translate-x-0.5">→</span>
        </Link>
      </div>
    </header>
  );
}
