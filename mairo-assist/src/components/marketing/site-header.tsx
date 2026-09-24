"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#demo", label: "Demo" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-colors duration-300", scrolled || open ? "border-b border-line bg-ink-950/80 backdrop-blur-xl" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Logo />
        <nav aria-label="Main" className="hidden flex-1 justify-center gap-7 text-sm text-fg-muted md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-fg">{l.label}</a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link href="/login" className="rounded-xl px-3 py-2 text-sm text-fg-muted hover:text-fg">Log in</Link>
          <ButtonLink href="/signup" size="sm">Get Started</ButtonLink>
        </div>
        <button type="button" className="ml-auto rounded-xl p-2 text-fg-muted md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="border-t border-line px-5 pb-5 md:hidden">
          <ul className="space-y-1 py-3">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-fg-muted hover:bg-white/5 hover:text-fg">{l.label}</a>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <ButtonLink href="/login" variant="secondary">Log in</ButtonLink>
            <ButtonLink href="/signup">Get Started</ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}
