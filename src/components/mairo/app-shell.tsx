"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { setViewMode } from "@/lib/actions/view-mode-actions";
import type { ViewMode } from "@/lib/view-mode";

// The logged-in MAIRO shell.
//
// This replaces a sidebar of eleven feature names — Overview, Monthly plan,
// Performance, Your social posts, Where you advertise, Measuring sales, AI
// specialists — that on a phone opened as a full-screen list you had to dismiss
// every single time you wanted to move. That is a table of contents, not
// navigation.
//
// What replaces it is the reference: eight destinations in a lit sidebar on
// desktop, five in a persistent bottom bar on mobile. Nothing was deleted. Every
// old page still exists and is still reachable — the ones that are not
// day-to-day destinations moved into Account, which is a real screen rather
// than a drawer.
//
// The naming changed with it. "AI specialists" is gone because MAIRO has one
// assistant now, not three; "Where you advertise" is Integrations; "Measuring
// sales" and "Performance" are both Analytics; "Monthly plan" is Billing.

export type NavEntry = {
  href: string;
  label: string;
  icon: ReactNode;
};

/* --------------------------------------------------------------- the icons */
/* Drawn rather than imported: a dependency for eight glyphs is a dependency to
   keep patched forever, and these are twelve lines each. */

const I = {
  home: (
    <path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1V9.5z" />
  ),
  create: (
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6.6v6.8M6.6 10h6.8" />
    </>
  ),
  campaigns: <path d="M3.5 15.5V9M8.5 15.5V5.5M13.5 15.5v-4M17.5 15.5V7.5" />,
  creatives: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2.2" />
      <circle cx="7.4" cy="8.2" r="1.3" />
      <path d="M3.6 13.6l3.8-3.8 3.4 3.4 2.4-2 3.2 3.2" />
    </>
  ),
  audiences: (
    <>
      <circle cx="7.6" cy="7" r="2.5" />
      <circle cx="13.8" cy="8.4" r="1.9" />
      <path d="M3.2 15.6c0-2.2 2-3.9 4.4-3.9s4.4 1.7 4.4 3.9" />
      <path d="M13.4 12.3c1.9.3 3.4 1.6 3.4 3.3" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 16h14" />
      <path d="M4.5 13l3.4-4 3 2.6L17 5.5" />
    </>
  ),
  mairo: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 3.4v13.2M3.6 8.2h12.8M3.6 11.8h12.8" />
    </>
  ),
  integrations: (
    <>
      <rect x="3" y="3.5" width="6" height="6" rx="1.8" />
      <rect x="11" y="3.5" width="6" height="6" rx="1.8" />
      <rect x="3" y="11" width="6" height="6" rx="1.8" />
      <path d="M11.5 14h5M14 11.5v5" />
    </>
  ),
  billing: (
    <>
      <rect x="2.6" y="5" width="14.8" height="10" rx="2.2" />
      <path d="M2.6 8.6h14.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2L4.8 4.8" />
    </>
  ),
  account: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 16.4c0-2.7 2.7-4.6 6-4.6s6 1.9 6 4.6" />
    </>
  ),
};

function Icon({ d, className = "" }: { d: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {d}
    </svg>
  );
}

/* ----------------------------------------------------------------- the map */

/** The eight day-to-day destinations. Desktop sidebar, in this order. */
export const PRIMARY_NAV: NavEntry[] = [
  { href: "/dashboard", label: "Home", icon: <Icon d={I.home} /> },
  { href: "/dashboard/create", label: "Create", icon: <Icon d={I.create} /> },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: <Icon d={I.campaigns} /> },
  { href: "/dashboard/creatives", label: "Creatives", icon: <Icon d={I.creatives} /> },
  { href: "/dashboard/audiences", label: "Audiences", icon: <Icon d={I.audiences} /> },
  { href: "/dashboard/analytics", label: "Analytics", icon: <Icon d={I.analytics} /> },
  { href: "/dashboard/agents", label: "Mairo AI", icon: <Icon d={I.mairo} /> },
  { href: "/dashboard/integrations", label: "Integrations", icon: <Icon d={I.integrations} /> },
];

/** Bottom of the sidebar. The things you go to occasionally, on purpose. */
export const SECONDARY_NAV: NavEntry[] = [
  { href: "/dashboard/plan", label: "Billing", icon: <Icon d={I.billing} /> },
  { href: "/dashboard/settings", label: "Settings", icon: <Icon d={I.settings} /> },
  { href: "/dashboard/account", label: "Account", icon: <Icon d={I.account} /> },
];

/** The five on a phone. Chosen by what someone opens the app to do. */
const MOBILE_NAV: NavEntry[] = [
  { href: "/dashboard", label: "Home", icon: <Icon d={I.home} /> },
  { href: "/dashboard/create", label: "Create", icon: <Icon d={I.create} /> },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: <Icon d={I.campaigns} /> },
  { href: "/dashboard/agents", label: "Mairo AI", icon: <Icon d={I.mairo} /> },
  { href: "/dashboard/account", label: "Account", icon: <Icon d={I.account} /> },
];

/**
 * Whether a nav entry owns the current URL.
 *
 * Prefix matching for everything except /dashboard itself, which would
 * otherwise match every page in the product and light up permanently.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ------------------------------------------------------------- the toggle */

export function ViewToggle({ mode }: { mode: ViewMode }) {
  const [pending, start] = useTransition();

  return (
    <div
      className="inline-flex items-center rounded-full border p-0.5"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.7)" }}
      role="group"
      aria-label="Interface detail"
    >
      {(["simple", "advanced"] as const).map((m) => {
        const on = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => start(() => void setViewMode(m))}
            className={`rounded-full px-3 py-1.5 text-[11px] font-medium capitalize transition-all duration-300 [transition-timing-function:var(--ease-mairo)] disabled:opacity-60 ${
              on ? "text-white" : "text-faint hover:text-muted"
            }`}
            style={on ? { backgroundImage: "var(--mairo-ramp)" } : undefined}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- the shell */

export function AppShell({
  children,
  mode,
  businessName,
  userName,
  showUpgrade = false,
  extraNav = [],
  footer,
}: {
  children: ReactNode;
  mode: ViewMode;
  businessName: string;
  /** Whose account this is, for the chip in the top right. */
  userName: string;
  /** Hidden on the top plan, where there is nothing to upgrade to. */
  showUpgrade?: boolean;
  /**
   * Entries the layout decided this account should also see — Enquiries only
   * exists for businesses that collect them, and the old layout already made
   * that call from the database.
   */
  extraNav?: NavEntry[];
  /** Sign out, the org switcher, whatever the layout already put down there. */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const primary = [...PRIMARY_NAV, ...extraNav];

  const row = (item: NavEntry, active: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      data-tour={`nav:${item.href}`}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all duration-300 [transition-timing-function:var(--ease-mairo)] ${
        active ? "text-white" : "text-muted hover:bg-white/[0.04] hover:text-white"
      }`}
      style={
        active
          ? { backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-lift)" }
          : undefined
      }
    >
      <span className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-faint group-hover:text-blue-bright"}`}>
        {item.icon}
      </span>
      {item.label}
    </Link>
  );

  return (
    <div className="min-h-screen">
      {/* ---- Desktop sidebar ---- */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r px-3.5 py-5 lg:flex"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(6,9,20,0.86)" }}
      >
        <Link href="/dashboard" className="mb-6 px-2 text-[15px] font-light tracking-[0.3em] text-white">
          MAIRO
        </Link>

        <nav className="flex flex-1 flex-col gap-1">{primary.map((i) => row(i, isActive(pathname, i.href)))}</nav>

        {showUpgrade && (
          <Link
            href="/dashboard/plan"
            className="mb-4 block rounded-2xl border p-4 text-center transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:border-[color:var(--mairo-line-lit)]"
            style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)" }}
          >
            <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl text-blue-bright">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
                <path d="M3 14l1.6-8 4 3.4L10 4l1.4 5.4 4-3.4L17 14H3z" />
              </svg>
            </span>
            <span className="block text-[13px] font-medium text-white">Upgrade plan</span>
            <span className="mt-1 block text-[11px] leading-relaxed text-faint">
              More features, higher limits.
            </span>
            <span
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium text-white"
              style={{ backgroundImage: "var(--mairo-ramp)" }}
            >
              Upgrade
              <span aria-hidden>→</span>
            </span>
          </Link>
        )}

        <div className="mt-4 space-y-1 border-t pt-4" style={{ borderColor: "var(--mairo-line)" }}>
          {SECONDARY_NAV.map((i) => row(i, isActive(pathname, i.href)))}
          {footer}
        </div>
      </aside>

      {/* ---- Mobile top bar. The name of the business, and the mode. ---- */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(6,9,20,0.92)" }}
      >
        <Link href="/dashboard" className="text-[13px] font-light tracking-[0.3em] text-white">
          MAIRO
        </Link>
        <span className="truncate text-[12px] text-faint">{businessName}</span>
        <div className="ml-auto">
          <ViewToggle mode={mode} />
        </div>
      </header>

      {/* ---- The page ----

          pb-24 on mobile so the bottom bar never sits on top of the last
          control on the screen, which is the single most common way a bottom
          nav breaks a form. */}
      <main className="px-4 pb-24 pt-5 sm:px-6 lg:ml-[248px] lg:px-10 lg:pb-16 lg:pt-8">
        {/* Desktop keeps the toggle at the top of the content rather than in
            the sidebar: it changes what this screen shows, so it belongs
            beside the screen. */}
        <div className="mb-6 hidden items-center justify-end gap-4 lg:flex">
          <ViewToggle mode={mode} />
          {/* The reference also puts a notification bell here. There is no
              notification system behind it yet, and a bell that never has
              anything in it is a control that lies about what the product
              does — it arrives with the feature. */}
          <Link
            href="/dashboard/account"
            className="flex items-center gap-2.5 rounded-full border py-1 pl-1 pr-3.5 transition-colors hover:border-[color:var(--mairo-line-lit)]"
            style={{ borderColor: "var(--mairo-line)" }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium text-white"
              style={{ backgroundImage: "var(--mairo-ramp)" }}
              aria-hidden
            >
              {(userName || businessName || "?").charAt(0).toUpperCase()}
            </span>
            <span className="text-[12.5px] text-white">{userName || businessName}</span>
          </Link>
        </div>
        {children}
      </main>

      {/* ---- Mobile bottom navigation ---- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(6,9,20,0.96)" }}
        aria-label="Primary"
      >
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center gap-1 px-1 py-2.5"
            >
              {/* The lit rail over the active tab. An overlay rather than a
                  background so the glow can feather. */}
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 top-0 h-px"
                  style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "0 0 12px 1px rgba(61,125,255,0.6)" }}
                />
              )}
              <span className={`h-5 w-5 ${active ? "text-blue-bright" : "text-faint"}`}>{item.icon}</span>
              <span className={`text-[10px] leading-none ${active ? "text-white" : "text-faint"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
