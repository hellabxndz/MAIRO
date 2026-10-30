"use client";

import { Wordmark } from "@/components/wordmark";
import { AppThemeScope } from "@/components/theme/theme";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useTransition, type ReactNode } from "react";
import { setViewMode } from "@/lib/actions/view-mode-actions";
import type { ViewMode } from "@/lib/view-mode";
import { AskMairoButton } from "./create-menu";
import { AmbientSky } from "@/components/ambient-sky";

// The logged-in MAIRO shell.
//
// Four places, the same four on every screen and every device: Overview,
// Campaigns, Creatives and Results. Everything else a business sets once and
// rarely touches is behind the profile button, in Account.
//
// It used to be eight sidebar destinations (Performance, Intelligence,
// Recommendations, Approvals and Results among them) that each answered part
// of the same two questions: how are my ads doing, and what does MAIRO want
// me to say yes to. The first is Results now; the second is on the Overview,
// where the owner already is. Nothing was deleted. Every route still exists,
// still works and lights up the section it belongs to (`also` below).

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
  // Three people: the AI team's specialties working together.
  team: (
    <>
      <circle cx="10" cy="7" r="2.4" />
      <circle cx="4.8" cy="8.6" r="1.8" />
      <circle cx="15.2" cy="8.6" r="1.8" />
      <path d="M6.4 15.6c0-2.2 1.6-3.8 3.6-3.8s3.6 1.6 3.6 3.8M2.2 15c0-1.6 1.1-2.8 2.6-2.8M17.8 15c0-1.6-1.1-2.8-2.6-2.8" />
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
 * The four sections. Each also owns the older pages that now live inside it,
 * so arriving on one of them (from a link, a notification, a bookmark) still
 * shows the owner where they are.
 */
export const PRIMARY_NAV: NavEntry[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: <Icon d={I.home} />,
    // Approvals and the AI's findings are answered from the Overview.
    also: ["/dashboard/mission", "/dashboard/decisions", "/dashboard/coach", "/dashboard/intelligence", "/dashboard/team", "/dashboard/agents", "/dashboard/health"],
  },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: <Icon d={I.campaigns} />, also: ["/dashboard/create", "/dashboard/leads", "/dashboard/launch"] },
  { href: "/dashboard/creatives", label: "Creatives", icon: <Icon d={I.creatives} />, also: ["/dashboard/creative-studio"] },
  { href: "/dashboard/results", label: "Results", icon: <Icon d={I.analytics} />, also: ["/dashboard/analytics", "/dashboard/reports", "/dashboard/activity"] },
];

/**
 * After the four, which the layout may extend (the free plan's two pages).
 * Kept as a slot so the layout's order holds.
 */
export const ASSISTANT_NAV: NavEntry | null = null;

/** Bottom of the sidebar: Account, which holds everything else. */
export const SECONDARY_NAV: NavEntry[] = [
  {
    href: "/dashboard/account",
    label: "Account",
    icon: <Icon d={I.account} />,
    also: ["/dashboard/settings", "/dashboard/business", "/dashboard/integrations", "/dashboard/billing", "/dashboard/meta", "/dashboard/tracking", "/dashboard/pixel", "/dashboard/website", "/dashboard/notifications", "/dashboard/guide", "/dashboard/sales-setup", "/dashboard/plan", "/dashboard/meta-capabilities"],
  },
];

/** The phone's bottom bar: the same four, so the two never disagree. */
const MOBILE_NAV: NavEntry[] = PRIMARY_NAV;

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
            className={`min-h-9 rounded-full px-3 py-1.5 text-[11px] font-medium capitalize transition-all duration-300 lg:min-h-0 [transition-timing-function:var(--ease-mairo)] disabled:opacity-60 ${
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

/* ---------------------------------------------------------- one nav row */

/**
 * One sidebar row, as the app draws it. Exported so the website's product
 * demonstrations draw the same row (without an href it's inert text), and a
 * change to the sidebar changes both.
 */
export function NavRowView({ item, active, locked = false, href }: { item: NavEntry; active: boolean; locked?: boolean; href?: string }) {
  // The current section is a quiet fill, not a lit gradient: the page is what
  // should hold the eye, not the sidebar.
  const className = `group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors duration-200 ${
    active ? "bg-white/[0.08] font-medium text-white" : "text-muted hover:bg-white/[0.04] hover:text-white"
  }`;
  const style = undefined;
  const inner = (
    <>
      <span className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-faint group-hover:text-white"}`}>{item.icon}</span>
      <span className="truncate whitespace-nowrap">{item.label}</span>
      {item.badge && (
        // A locked feature's plan, with the lock inside the label.
        <span className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium ${active ? "border-white/60 text-white" : "border-violet-400/40 text-violet-bright"}`}>
          {locked && (
            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Locked">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
          )}
          {item.badge}
        </span>
      )}
      {!item.badge && locked && (
        <svg viewBox="0 0 16 16" className="ml-auto h-3.5 w-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label="Locked">
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      )}
    </>
  );
  if (!href) {
    return (
      <span className={className} style={style} aria-current={active ? "page" : undefined}>
        {inner}
      </span>
    );
  }
  return (
    <Link href={href} data-tour={`nav:${item.href}`} aria-current={active ? "page" : undefined} className={className} style={style}>
      {inner}
    </Link>
  );
}

/** The sidebar's background, shared with the website's demonstrations. */
/** A theme variable (globals.css), so the light theme turns the sidebar over with everything else. */
export const SIDEBAR_BACKGROUND = "var(--mairo-sidebar)";

/* ------------------------------------------------------- the profile button */

/** The way into Account, top right, as in any app: an initial in a circle. */
function ProfileButton({ userName, businessName, wide = false }: { userName: string; businessName: string; wide?: boolean }) {
  const initial = (userName || businessName || "?").charAt(0).toUpperCase();
  const dot = (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-black">
      {initial}
    </span>
  );
  if (!wide) {
    return (
      <Link href="/dashboard/account" aria-label="Account" className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
        {dot}
      </Link>
    );
  }
  return (
    <Link
      href="/dashboard/account"
      className="flex items-center gap-2.5 rounded-full border py-1 pl-1 pr-3.5 transition-colors hover:border-[color:var(--mairo-line-lit)]"
      style={{ borderColor: "var(--mairo-line)" }}
    >
      {dot}
      <span className="max-w-[180px] truncate text-[13px] text-white">{userName || businessName}</span>
      <span className="sr-only">— Account</span>
    </Link>
  );
}

/* -------------------------------------------------------------- the shell */

export function AppShell({
  children,
  businessName,
  userName,
  showUpgrade = false,
  extraNav = [],
  notifications,
  assistantName,
  footer,
  locked = [],
  switcher,
}: {
  children: ReactNode;
  /** The business switcher for the phone's top bar, when this person is on more than one team. */
  switcher?: ReactNode;
  /** Nav destinations shown with a lock: the account hasn't subscribed yet. */
  locked?: string[];
  /** Simple or Advanced. The switch itself lives in Account now. */
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
   * has to click "MAIRO AI" to reach Jess has been told the rename did not
   * really take.
   */
  assistantName?: string;
  /** Sign out, the org switcher, whatever the layout already put down there. */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const primary = [...PRIMARY_NAV, ...extraNav, ...(ASSISTANT_NAV ? [ASSISTANT_NAV] : [])];
  const askName = assistantName || "MAIRO";

  const row = (item: NavEntry, active: boolean) => <NavRowView key={item.href + item.label} item={item} active={active} locked={locked.includes(item.href)} href={item.href} />;

  return (
    <div className="relative isolate min-h-screen">
      <AmbientSky />
      {/* ---- Desktop sidebar ---- */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto overscroll-contain border-r px-3.5 py-4 [scrollbar-width:thin] lg:flex"
        style={{ borderColor: "var(--mairo-line)", background: SIDEBAR_BACKGROUND }}
      >
        <div className="mb-4 shrink-0 px-2">
          <Wordmark href="/dashboard" className="text-[15px]" />
        </div>
        {/* The one thing to start from anywhere, the way a chat app puts
            "New chat" at the top. Promotions and "tell MAIRO something" are
            the Overview's question box now. */}
        <div className="mb-4 shrink-0">
          <Link
            href="/dashboard/create"
            data-tour="create"
            className="flex min-h-10 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.05]"
            style={{ borderColor: "var(--mairo-line)" }}
          >
            <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center text-[18px] leading-none">+</span>
            New campaign
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {primary.map((i, n) => (
            // Two entries can share an address (before a plan is approved, Pricing opens the plan too).
            <Fragment key={`${i.href}:${i.label}`}>
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

      <AppThemeScope />
      {/* ---- Mobile top bar: whose account, MAIRO, the bell and the profile. ---- */}
      <header
        className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.94)" }}
      >
        <Wordmark href="/dashboard" className="text-[13px]" />
        {/* Someone on more than one team gets the switcher on a row of its own, so it never crowds the controls. */}
        {switcher ? <div className="order-last min-w-0 basis-full">{switcher}</div> : <span className="min-w-0 flex-1 truncate text-[12.5px] text-faint">{businessName}</span>}
        <div className="ml-auto flex items-center gap-1">
          <AskMairoButton name={askName} compact />
          {notifications}
          {/* Account: business, Meta, tracking, billing, help, log out. */}
          <ProfileButton userName={userName} businessName={businessName} />
        </div>
      </header>

      {/* ---- The page ----

          pb-24 on mobile so the bottom bar never sits on top of the last
          control on the screen, which is the single most common way a bottom
          nav breaks a form. */}
      <main className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:ml-[248px] lg:px-10 lg:pb-16 lg:pt-8">
        <div className="mb-6 hidden items-center justify-end gap-3 lg:flex">
          <AskMairoButton name={askName} />
          {notifications}
          <ProfileButton userName={userName} businessName={businessName} wide />
        </div>
        {children}
      </main>

      {/* ---- Mobile bottom navigation: the same four sections ---- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.96)" }}
        aria-label="Primary"
      >
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href, item.also);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2"
            >
              {active && <span aria-hidden className="absolute inset-x-5 top-0 h-[2px] rounded-full bg-white" />}
              <span className={`flex h-5 w-5 items-center justify-center ${active ? "text-white" : "text-faint"}`}>{item.icon}</span>
              <span className={`text-[11px] leading-none ${active ? "font-medium text-white" : "text-faint"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
