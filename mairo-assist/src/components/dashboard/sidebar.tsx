"use client";

import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Menu,
  Package,
  Plug,
  Settings,
  ShoppingBag,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "./nav-items";

const ICONS: Record<NavIcon, typeof Inbox> = {
  overview: LayoutDashboard,
  inbox: Inbox,
  orders: ShoppingBag,
  approvals: ClipboardCheck,
  customers: UserRound,
  products: Package,
  ai: Bot,
  knowledge: BookOpen,
  analytics: BarChart3,
  integrations: Plug,
  team: Users,
  billing: CreditCard,
  settings: Settings,
};

function NavList({ items, onNavigate, badges }: { items: NavItem[]; onNavigate?: () => void; badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        const badge = badges[item.href];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                active ? "bg-gradient-to-r from-violet/20 to-electric/5 text-fg ring-1 ring-violet/25" : "text-fg-muted hover:bg-white/5 hover:text-fg",
              )}
            >
              <Icon className={cn("size-4", active ? "text-violet-glow" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {badge ? (
                <span className="rounded-full bg-warning/15 px-1.5 text-[11px] font-medium text-warning" aria-label={`${badge} need attention`}>
                  {badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type ShellProps = { items: NavItem[]; badges: Record<string, number>; footer: React.ReactNode };

export function DesktopSidebar({ items, badges, footer }: ShellProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-ink-900/80 backdrop-blur-xl lg:flex">
      <div className="px-5 py-5">
        <Logo href="/dashboard" />
      </div>
      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList items={items} badges={badges} />
      </nav>
      <div className="border-t border-line p-3">{footer}</div>
    </aside>
  );
}

export function MobileNav({ items, badges, footer }: ShellProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-white/5 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu className="size-5" />
      </button>

      {open &&
        createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-line bg-ink-900">
            <div className="flex items-center justify-between px-5 py-4">
              <Logo href="/dashboard" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-fg-muted hover:bg-white/5">
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 pb-4">
              <NavList items={items} badges={badges} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="border-t border-line p-3" onClick={() => setOpen(false)}>{footer}</div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
