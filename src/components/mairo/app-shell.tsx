"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useTransition, type ReactNode } from "react";
import { setViewMode } from "@/lib/actions/view-mode-actions";
import type { ViewMode } from "@/lib/view-mode";
import { AskMairoButton, CreateMenu } from "./create-menu";

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
  /** A small heading shown above the first entry of a group, e.g. Scale's "Social". */
  group?: string;
  /** A plan label beside the name, e.g. "Scale" on a locked feature. */
  badge?: string;
  /** Active only on this exact path, not its sub-pages. */
  exact?: boolean;
  /** Other paths that belong to this destination (Creative Studio is part of Creatives). */
  also?: string[];
};

/* --------------------------------------------------------------- the icons */
/* Drawn rather than imported: a dependency for eight glyphs is a dependency to
   keep patched forever, and these are twelve lines each. */

const I = {
  mission: (
    <path d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M10 10.6a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2z" />
  ),
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
  // A magnifier over a rising line: following results to their cause.
  coach: <path d="M9 15.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.4 13.4 17.5 17.5M6 11l2-2 1.4 1.4L12 7.6" />,
  analytics: (
    <>
      <path d="M3 16h14" />
      <path d="M4.5 13l3.4-4 3 2.6L17 5.5" />
    </>
  ),
  reports: (
    <>
      <path d="M5 3h7l3 3v11H5z" />
      <path d="M12 3v3h3" />
      <path d="M7.5 11h5M7.5 13.5h3.5" />
    </>
  ),
  decisions: (
    <>
      <path d="M10 2.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L10 12.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </>
  ),
  activity: (
    <>
      <path d="M2.8 10h3.4l2-5 3.6 10 2-5h3.4" />
    </>
  ),
  brain: (
    <>
      <path d="M7.4 4.2a2.6 2.6 0 0 0-4.2 2.4 2.8 2.8 0 0 0 .4 5.2 2.6 2.6 0 0 0 4.3 2.4" />
      <path d="M12.6 4.2a2.6 2.6 0 0 1 4.2 2.4 2.8 2.8 0 0 1-.4 5.2 2.6 2.6 0 0 1-4.3 2.4" />
      <path d="M10 3.6v12.8" />
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

/**
 * The day-to-day destinations, deliberately few: Overview, AI Team,
 * Approvals, Campaigns, Creatives, Analytics, (Social Manager) — and Settings at
 * the bottom. Everything else lives inside one of them: creative tools inside
 * Creatives, reports and activity inside Analytics, the business profile,
 * integrations, billing and account inside Settings, the mission and
 * decisions behind the Overview's cards. Every route still exists.
 */
export const PRIMARY_NAV: NavEntry[] = [
  { href: "/dashboard", label: "Overview", icon: <Icon d={I.home} />, also: ["/dashboard/mission"] },
  // The AI Team (and asking it), then what it recommends.
  { href: "/dashboard/team", label: "AI Team", icon: <Icon d={I.mairo} />, also: ["/dashboard/agents"] },
  { href: "/dashboard/coach", label: "Performance Coach", icon: <Icon d={I.coach} /> },
  { href: "/dashboard/decisions", label: "Approvals", icon: <Icon d={I.decisions} /> },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: <Icon d={I.campaigns} />, also: ["/dashboard/create", "/dashboard/leads"] },
  { href: "/dashboard/creatives", label: "Creatives", icon: <Icon d={I.creatives} />, also: ["/dashboard/creative-studio"] },
  { href: "/dashboard/analytics", label: "Analytics", icon: <Icon d={I.analytics} />, also: ["/dashboard/reports", "/dashboard/activity"] },
];

/**
 * After Social Manager, which the layout adds for the plans that have it
 * (or locked). The assistant is part of the AI Team now — "Ask your AI
 * team" — so this is empty; kept as a slot so the layout's order holds.
 */
export const ASSISTANT_NAV: NavEntry | null = null;

/** Bottom of the sidebar. */
export const SECONDARY_NAV: NavEntry[] = [
  { href: "/dashboard/settings", label: "Settings", icon: <Icon d={I.settings} />, also: ["/dashboard/business", "/dashboard/integrations", "/dashboard/billing", "/dashboard/account", "/dashboard/meta", "/dashboard/tracking", "/dashboard/notifications"] },
];

/** The phone's bottom bar: four destinations around the Create button. */
const MOBILE_NAV: NavEntry[] = [
  { href: "/dashboard", label: "Overview", icon: <Icon d={I.home} />, also: ["/dashboard/mission", "/dashboard/decisions"] },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: <Icon d={I.campaigns} />, also: ["/dashboard/create"] },
  { href: "/dashboard/creatives", label: "Creatives", icon: <Icon d={I.creatives} />, also: ["/dashboard/creative-studio"] },
  { href: "/dashboard/team", label: "AI Team", icon: <Icon d={I.mairo} />, also: ["/dashboard/agents", "/dashboard/decisions"] },
];

/**
 * Whether a nav entry owns the current URL.
 *
 * Prefix matching for everything except /dashboard itself, which would
 * otherwise match every page in the product and light up permanently.
 */
function isActive(pathname: string, href: string, also: string[] = []): boolean {
  const under = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  if (also.some(under)) return true;
  if (href === "/dashboard") return pathname === "/dashboard";
  return under(href);
}

/* ------------------------------------------------------------- the toggle */

export function ViewToggle({ mode }: { mode: ViewMode }) {
  const [pending, start] = useTransition();

  return (
    <div
      className="inline-flex items-center rounded-full border p-0.5"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.7)" }}
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
  notifications,
  assistantName,
  footer,
  locked = [],
  scale = false,
}: {
  children: ReactNode;
  /** Active Scale: the Create menu offers social posts. */
  scale?: boolean;
  /** Nav destinations shown with a lock: the account hasn't subscribed yet. */
  locked?: string[];
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
  /** The bell, when the layout had notifications to give it. */
  notifications?: ReactNode;
  /**
   * What this business calls its assistant, for the nav entry.
   *
   * The label is the name rather than a product noun because that is what the
   * customer thinks of it as — somebody who renamed theirs to Jess and then
   * has to click "Mairo AI" to reach Jess has been told the rename did not
   * really take.
   */
  assistantName?: string;
  /** Sign out, the org switcher, whatever the layout already put down there. */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const primary = [...PRIMARY_NAV, ...extraNav, ...(ASSISTANT_NAV ? [ASSISTANT_NAV] : [])];
  const askName = assistantName || "Mairo";

  const row = (item: NavEntry, active: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      data-tour={`nav:${item.href}`}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-[7px] text-[13px] transition-all duration-300 [transition-timing-function:var(--ease-mairo)] ${
        active ? "text-white" : "text-muted hover:bg-white/[0.04] hover:text-white"
      }`}
      style={
        active
          ? { backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-lift)" }
          : undefined
      }
    >
      <span className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-faint group-hover:text-blue-bright"}`}>
        {item.icon}
      </span>
      <span className="truncate whitespace-nowrap">{item.label}</span>
      {item.badge && (
        // A locked feature's plan, with the lock inside the label.
        <span className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium ${active ? "border-white/60 text-white" : "border-violet-400/40 text-violet-bright"}`}>
          {locked.includes(item.href) && (
            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Locked">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
          )}
          {item.badge}
        </span>
      )}
      {!item.badge && locked.includes(item.href) && (
        <svg viewBox="0 0 16 16" className="ml-auto h-3.5 w-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label="Locked">
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen">
      {/* ---- Desktop sidebar ---- */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto overscroll-contain border-r px-3.5 py-4 [scrollbar-width:thin] lg:flex"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.86)" }}
      >
        <Link href="/dashboard" className="mb-4 shrink-0 px-2 text-[15px] font-light tracking-[0.3em] text-white">
          MAIRO
        </Link>
        <div className="mb-4 shrink-0">
          <CreateMenu scale={scale} />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {primary.map((i, n) => (
            <Fragment key={i.href}>
              {i.group && i.group !== primary[n - 1]?.group && (
                <p className="mt-3 px-3 pb-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-faint">{i.group}</p>
              )}
              {row(i, i.exact ? pathname === i.href : isActive(pathname, i.href, i.also))}
            </Fragment>
          ))}
        </nav>

        {/* One slim row rather than a card: on a short screen a tall card is
            what pushed Billing, Settings and Sign out out of reach. */}
        {showUpgrade && (
          <Link
            href="/dashboard/billing"
            className="mt-3 flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:border-[color:var(--mairo-line-lit)]"
            style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)" }}
          >
            <span className="h-4 w-4 shrink-0 text-blue-bright">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
                <path d="M3 14l1.6-8 4 3.4L10 4l1.4 5.4 4-3.4L17 14H3z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-white">Upgrade plan</span>
              <span className="block truncate text-[10.5px] text-faint">More features, higher limits</span>
            </span>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-white"
              style={{ backgroundImage: "var(--mairo-ramp)" }}
              aria-hidden
            >
              →
            </span>
          </Link>
        )}

        <div className="mt-3 space-y-0.5 border-t pt-3" style={{ borderColor: "var(--mairo-line)" }}>
          {SECONDARY_NAV.map((i) => row(i, isActive(pathname, i.href, i.also)))}
          {footer}
        </div>
      </aside>

      {/* ---- Mobile top bar. The name of the business, and the mode. ---- */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.92)" }}
      >
        <Link href="/dashboard" className="text-[13px] font-light tracking-[0.3em] text-white">
          MAIRO
        </Link>
        <span className="truncate text-[12px] text-faint">{businessName}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <AskMairoButton name={askName} compact />
          <ViewToggle mode={mode} />
          {notifications}
          {/* Settings — and from there analytics' neighbours, billing, account
              and signing out — on a phone. */}
          <Link
            href="/dashboard/settings"
            aria-label="Settings"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
            style={{ backgroundImage: "var(--mairo-ramp)" }}
          >
            {(userName || businessName || "?").charAt(0).toUpperCase()}
          </Link>
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
          <AskMairoButton name={askName} />
          <ViewToggle mode={mode} />
          {notifications}
          <Link
            href="/dashboard/settings"
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
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.96)" }}
        aria-label="Primary"
      >
        {[...MOBILE_NAV.slice(0, 2), null, ...MOBILE_NAV.slice(2)].map((item) => {
          if (!item) return <CreateMenu key="create" scale={scale} variant="bar" />;
          const active = isActive(pathname, item.href, item.also);
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
              <span
                className={`flex h-5 w-5 items-center justify-center ${
                  active ? "text-blue-bright" : "text-faint"
                }`}
              >
                {item.icon}
              </span>
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
