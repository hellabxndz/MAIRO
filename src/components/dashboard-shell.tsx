"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

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
      pathname === href
        ? "bg-white/10 text-white"
        : "text-neutral-300 hover:bg-white/5 hover:text-white"
    }`;

  const navList = (onNavigate?: () => void) => (
    <nav className="flex flex-1 flex-col gap-1">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClass(item.href)}>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const signOutButton = (
    <form action={onSignOut}>
      <button
        type="submit"
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 transition hover:bg-white/5 hover:text-white"
      >
        Sign out
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:hidden">
        <Link href="/" className="text-lg font-semibold">
          {brandLabel}
        </Link>
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

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-white/10 bg-neutral-950 p-6">
            <div className="mb-8 flex items-center justify-between">
              <Link href="/" className="text-lg font-semibold" onClick={() => setOpen(false)}>
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
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 p-6 md:flex">
        <Link href="/" className="mb-1 text-lg font-semibold">
          {brandLabel}
        </Link>
        {subtitle && <p className="mb-8 truncate text-sm text-neutral-500">{subtitle}</p>}
        {navList()}
        {signOutButton}
      </aside>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
