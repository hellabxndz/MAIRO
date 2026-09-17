"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// The bar sits inset from the viewport so the sky runs behind and around it,
// which is what stops it reading as a normal website header.
//
// What hides the page as it passes underneath is a gradient, not a panel. It
// used to be a dark rounded pill with a border and a blur, and the trouble with
// a shape is that it has edges: every section of the page slid under it and
// collided with it, so headlines and card borders cut across the links. A
// gradient has no edges. Content fades into the top of the frame and the links
// sit on the dark end of the fade.
//
// The three grouped menus come from the reference render. Every item in them
// goes somewhere that exists — a section of this page or a real route. A caret
// that opens onto "coming soon" is worse than no caret, so if a group ever
// empties out, delete the group rather than stubbing it.

type Item = { href: string; label: string; note: string };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Product",
    items: [
      { href: "#how-it-works", label: "How it works", note: "Four steps, start to live" },
      { href: "#capabilities", label: "Capabilities", note: "What the AI actually does" },
      { href: "/sign-up", label: "Launch your ads", note: "Create an account" },
    ],
  },
  {
    label: "Solutions",
    items: [
      { href: "#capabilities", label: "For small business", note: "Run ads without an agency" },
      { href: "/for-freelancers", label: "For freelancers", note: "Client work, one place" },
      { href: "#freelancers", label: "For agencies", note: "Every client under one login" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/privacy", label: "Privacy", note: "What we store, and why" },
      { href: "/terms", label: "Terms", note: "The agreement" },
      { href: "/data-deletion", label: "Data deletion", note: "Remove your data" },
    ],
  },
];

const FLAT: Item = { href: "#pricing", label: "Pricing", note: "" };

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close on Escape and on a click outside. Both, not one: a dropdown you can
  // only dismiss by clicking its own trigger again is a trap on a trackpad.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menu]);

  const floating = scrolled || open;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
      {/* The fade. Full bleed, so there is no shape anywhere — just the top of
          the page getting darker. Only once you have scrolled: over the hero
          there is nothing behind the links but sky. Solid through the row the
          links occupy, and gone by 150px, where the page is the page again. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-[150px] transition-opacity duration-500 ${
          floating ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.55) 66%, rgba(0,0,0,0.22) 82%, rgba(0,0,0,0) 100%)",
        }}
      />

      <div className="relative px-4 pt-4 sm:px-6 sm:pt-6">
        <div
          ref={navRef}
          className="pointer-events-auto mx-auto flex max-w-[1500px] items-center justify-between gap-6 px-5 py-3 sm:px-7"
        >
          <Link
            href="/"
            className="shrink-0 text-[13px] font-light tracking-[0.34em] text-white transition hover:text-blue-bright"
          >
            MAIRO
          </Link>

          {/* Centre group. Absolutely centred on the bar rather than centred in
              the leftover space, so it does not drift when the wordmark and the
              button either side change width. */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
            {GROUPS.map((g) => (
              <div key={g.label} className="relative">
                <button
                  type="button"
                  onClick={() => setMenu(menu === g.label ? null : g.label)}
                  aria-expanded={menu === g.label}
                  aria-haspopup="true"
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] transition-colors duration-200 ${
                    menu === g.label ? "text-white" : "text-muted hover:text-white"
                  }`}
                >
                  {g.label}
                  <svg
                    viewBox="0 0 10 10"
                    aria-hidden
                    className={`h-2.5 w-2.5 transition-transform duration-300 [transition-timing-function:var(--ease-mairo)] ${
                      menu === g.label ? "rotate-180" : ""
                    }`}
                    fill="none"
                  >
                    <path d="M2 3.8L5 6.8l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {menu === g.label && (
                  <div
                    className="absolute left-1/2 top-full z-50 mt-2 w-[260px] -translate-x-1/2 overflow-hidden rounded-2xl border p-1.5"
                    style={{
                      borderColor: "var(--mairo-line-lit)",
                      backgroundColor: "rgba(6,10,24,0.97)",
                      boxShadow: "var(--mairo-glow-lift)",
                    }}
                  >
                    {g.items.map((item) => (
                      <Link
                        key={item.label + item.href}
                        href={item.href}
                        onClick={() => setMenu(null)}
                        className="block rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-white/[0.06]"
                      >
                        <span className="block text-[13px] text-white">{item.label}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-faint">
                          {item.note}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <a
              href={FLAT.href}
              className="rounded-full px-3.5 py-2 text-[13px] text-muted transition-colors duration-200 hover:text-white"
            >
              {FLAT.label}
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-5">
            <Link
              href="/sign-in"
              className="hidden text-[12.5px] text-muted transition hover:text-white sm:inline"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:brightness-110"
              style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
            >
              Launch your ads
              <span aria-hidden>→</span>
            </Link>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 lg:hidden"
            >
              <span className={`block h-px w-5 bg-white transition ${open ? "translate-y-[3px] rotate-45" : ""}`} />
              <span className={`block h-px w-5 bg-white transition ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
            </button>
          </div>
        </div>

        {open && (
          <div
            className="pointer-events-auto mx-auto mt-2 max-h-[70vh] max-w-[1500px] overflow-y-auto rounded-3xl border px-6 py-6 lg:hidden"
            style={{ borderColor: "var(--mairo-line)", backgroundColor: "rgba(6,10,24,0.98)" }}
          >
            {GROUPS.map((g) => (
              <div key={g.label} className="mb-5">
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-faint">{g.label}</p>
                <div className="mt-2.5 flex flex-col">
                  {g.items.map((item) => (
                    <Link
                      key={item.label + item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="-mx-2 rounded-lg px-2 py-2 text-[14px] text-white/85 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <a
              href={FLAT.href}
              onClick={() => setOpen(false)}
              className="-mx-2 block rounded-lg px-2 py-2 text-[14px] text-white/85 transition hover:bg-white/[0.06] hover:text-white"
            >
              Pricing
            </a>
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="-mx-2 mt-1 block rounded-lg px-2 py-2 text-[14px] text-white/85 transition hover:bg-white/[0.06] hover:text-white"
            >
              Log in
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
