"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AmbientSky } from "@/components/ambient-sky";
import { StartTourLink } from "@/components/tour";
import { AppThemeScope, ThemeToggle } from "@/components/theme/theme";

// `section` starts a new labelled group in the sidebar.
type NavItem = { href: string; label: string; section?: string };

export function DashboardShell({
  navItems,
  brandLabel,
  subtitle,
  onSignOut,
  children,
}: {
  navItems: NavItem[];
  brandLabel: string;
  subtitle?: string;
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `rounded-lg px-3 py-2 text-sm transition ${
      pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`))
        ? "bg-white/[0.09] text-white"
        : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
    }`;

  const navList = (onNavigate?: () => void) => (
    <nav className="flex flex-1 flex-col gap-1">
      {navItems.map((item, i) => (
        <div key={item.href} className="contents">
        {item.section && <p className={`mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-neutral-500 ${i === 0 ? "" : "mt-5"}`}>{item.section}</p>}
        <Link
          href={item.href}
          onClick={onNavigate}
          // Lets the walkthrough point at a specific nav entry.
          data-tour={`nav:${item.href}`}
          className={linkClass(item.href)}
        >
          {item.label}
        </Link>
        </div>
      ))}
    </nav>
  );

  const signOutButton = (
    <>
      <StartTourLink className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 transition hover:bg-white/5 hover:text-white" />
      <form action={onSignOut}>
      <button
        type="submit"
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 transition hover:bg-white/5 hover:text-white"
      >
        Sign out
      </button>
      </form>
    </>
  );

  return (
    <div className="relative flex min-h-screen flex-col md:flex-row">
      <AmbientSky />
      <AppThemeScope />

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-paper/85 backdrop-blur px-4 py-3 md:hidden">
        <Link href="/" className="text-sm font-light tracking-[0.28em]">
          {brandLabel}
        </Link>
        <div className="flex items-center gap-2">
        <ThemeToggle className="h-9 w-9" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-white/5"
        >
          <span className="block h-0.5 w-5 bg-white" />
          <span className="block h-0.5 w-5 bg-white" />
        </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-white/[0.07] bg-paper p-6">
            <div className="mb-8 flex items-center justify-between">
              <Link href="/" className="text-sm font-light tracking-[0.28em]" onClick={() => setOpen(false)}>
                {brandLabel}
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white"
              >
                ✕
              </button>
            </div>
            {subtitle && <p className="mb-6 truncate text-sm text-neutral-500">{subtitle}</p>}
            {navList(() => setOpen(false))}
            {signOutButton}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-white/[0.07] bg-paper/70 p-6 md:flex">
        <div className="mb-1 flex items-center justify-between">
          <Link href="/" className="text-sm font-light tracking-[0.28em]">
            {brandLabel}
          </Link>
          <ThemeToggle className="h-8 w-8" />
        </div>
        {subtitle && (
          <p className="mb-8 truncate text-xs uppercase tracking-[0.14em] text-neutral-500">
            {subtitle}
          </p>
        )}
        {navList()}
        {signOutButton}
      </aside>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
