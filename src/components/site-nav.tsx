"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// The bar sits inset from the viewport so the sky runs behind and around it,
// which is what stops it reading as a normal website header.
//
// What hides the page as it passes underneath is a gradient, not a panel.
//
// It used to be a dark rounded pill with a border and a blur, and the trouble
// with a shape is that it has edges: every section of the page slid under it
// and collided with it, so headlines and card borders cut across the links and
// the whole thing read as a black box floating over the site. A gradient has
// no edges. Content fades into the top of the frame and the links sit on the
// dark end of the fade, which is how this is supposed to look and also happens
// to be less in the way.

const LINKS = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#pricing", label: "Pricing" },
  { href: "#freelancers", label: "Freelancers" },
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
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
      {/* The fade. Full bleed, so there is no shape anywhere — just the top of
          the page getting darker. Only once you have scrolled: over the hero
          there is nothing behind the links but sky, and dimming it there would
          cut the one full-bleed view of the backdrop the page gets. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-[150px] transition-opacity duration-500 ${
          floating ? "opacity-100" : "opacity-0"
        }`}
        style={{
          // Opaque exactly as far as the links reach, then off quickly.
          //
          // Both ends of this were wrong once. A short, heavy ramp hid the
          // collision but also swallowed the two lines beneath it, so
          // paragraphs read as clipped. Stretching it to three hundred pixels
          // fixed the clipping and put a haze over a third of the viewport
          // instead, dimming text that was nowhere near the navigation.
          //
          // What works is a hard floor and a fast exit: solid through the row
          // the links occupy, and nothing left by a hundred and fifty pixels
          // down, where the page is simply the page again.
          background:
            "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.55) 66%, rgba(0,0,0,0.22) 82%, rgba(0,0,0,0) 100%)",
        }}
      />

      <div className="relative px-4 pt-4 sm:px-6 sm:pt-6">
      <div
        className="pointer-events-auto mx-auto flex max-w-[1500px] items-center justify-between rounded-full px-5 py-3 sm:px-7"
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
        <div className="pointer-events-auto mx-auto mt-2 max-w-[1500px] rounded-3xl border border-white/[0.08] bg-black/95 px-7 py-7 md:hidden">
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
      </div>
    </header>
  );
}
