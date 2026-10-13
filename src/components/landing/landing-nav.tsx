"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";

// The public top bar, on the landing page and the free tools: Product, Free
// Tools, How It Works, Pricing, Sign In and the one call to action. Links are
// absolute ("/#pricing") so they work from any public page. On a phone they
// fold into a menu. Everything else lives in the footer.
//
// "Free Tools" appears only once at least one tool works (toolsLive), so the
// bar never leads to an empty hub. The call to action is the free preview —
// the visitor's own website first, an account only when they want to save.

const linksFor = (toolsLive: boolean, productHref: string) => [
  { href: productHref, label: "Product" },
  ...(toolsLive ? [{ href: "/tools", label: "Free Tools" }] : []),
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#pricing", label: "Pricing" },
];

export function LandingNav({
  toolsLive = false,
  cta = { href: "/preview", label: "Preview my campaign" },
  productHref = "/#product",
  dark = false,
}: {
  toolsLive?: boolean;
  cta?: { href: string; label: string };
  productHref?: string;
  /** Over a dark first screen (the story hero): the bar uses the dark palette. */
  dark?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const LINKS = linksFor(toolsLive, productHref);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-palette={dark ? "classic" : undefined}
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled || open ? "border-b border-white/[0.06] bg-field-3/80 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-[clamp(40px,10vw,190px)]">
          <Wordmark />

          <div className="hidden items-center gap-7 whitespace-nowrap xl:gap-9 text-[14px] font-medium text-white/90 lg:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/sign-in" className="hidden rounded-full border border-white/12 bg-white/[0.03] px-5 py-2.5 text-[13.5px] font-medium text-white/90 backdrop-blur transition hover:border-white/30 hover:text-white sm:inline-block whitespace-nowrap">
            Sign In
          </Link>
          <Link
            href={cta.href}
            className="whitespace-nowrap rounded-full bg-gradient-to-r from-[#3b6bff] to-[#8b4dfb] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_30px_-6px_rgba(79,125,255,0.9)] transition hover:brightness-110"
          >
            {cta.label} <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white lg:hidden"
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-white/[0.06] px-5 pb-5 lg:hidden">
          <ul className="space-y-1 pt-3">
            {[...LINKS, { href: "/sign-in", label: "Sign In" }].map((l) => (
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
