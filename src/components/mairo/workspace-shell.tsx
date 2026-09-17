"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The freelancer shell.
//
// /clients is the only part of the product that lives ABOVE an organization.
// Everything else — campaigns, creatives, the plan, the Meta connection —
// belongs to one client, and you get there by opening one from here. So this
// cannot reuse AppShell: that shell's nav points at /dashboard/*, which is
// always some client's dashboard, and its Simple/Advanced toggle is a property
// of a client's dashboard rather than of the workspace.
//
// What it does share is the shape, deliberately. A freelancer moving between
// their client list and a client's dashboard should feel the same product:
// same lit sidebar on desktop, same persistent bottom bar on mobile, same
// active-rail treatment. Three destinations rather than eight, because that is
// genuinely all there is up here — a list, a bill and a guide.
//
// The old screens had no shell at all. Each one drew its own header with its
// own "Back to clients" link, which is how /clients/billing ended up being a
// page you could only leave by going backwards.

export type WorkspaceNavEntry = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Anchor for the freelancer walkthrough in clients/tour-steps.ts. */
  tour?: string;
};

/* --------------------------------------------------------------- the icons */

function Icon({ d }: { d: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full"
      aria-hidden
    >
      {d}
    </svg>
  );
}

const NAV: WorkspaceNavEntry[] = [
  {
    href: "/clients",
    label: "Clients",
    icon: (
      <Icon
        d={
          <>
            <circle cx="7.6" cy="7" r="2.5" />
            <circle cx="13.8" cy="8.4" r="1.9" />
            <path d="M3.2 15.6c0-2.2 2-3.9 4.4-3.9s4.4 1.7 4.4 3.9" />
            <path d="M13.4 12.3c1.9.3 3.4 1.6 3.4 3.3" />
          </>
        }
      />
    ),
  },
  {
    href: "/clients/billing",
    label: "Billing",
    tour: "billing",
    icon: (
      <Icon
        d={
          <>
            <rect x="2.6" y="5" width="14.8" height="10" rx="2.2" />
            <path d="M2.6 8.6h14.8" />
          </>
        }
      />
    ),
  },
  {
    href: "/clients/guide",
    label: "Guide",
    tour: "guide",
    icon: (
      <Icon
        d={
          <>
            <path d="M3.4 4.6h5.2a2 2 0 0 1 2 2v9a1.6 1.6 0 0 0-1.6-1.6H3.4z" />
            <path d="M16.6 4.6h-5.2a2 2 0 0 0-2 2v9a1.6 1.6 0 0 1 1.6-1.6h5.6z" />
          </>
        }
      />
    ),
  },
];

/** /clients would prefix-match every page under it and light up permanently. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/clients") return pathname === "/clients";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* -------------------------------------------------------------- the shell */

export function WorkspaceShell({
  children,
  workspaceName,
  planName,
  clientCount,
  clientLimit,
  footer,
}: {
  children: ReactNode;
  workspaceName: string;
  planName: string;
  clientCount: number;
  /** Null when the plan has no client allowance at all — a workspace that has
   *  not subscribed yet. Rendered as "—" rather than as 0, which would read as
   *  a limit of zero rather than as "no plan". */
  clientLimit: number | null;
  /** Sign out, which the layout owns because it is a server action. */
  footer?: ReactNode;
}) {
  const pathname = usePathname();

  const usage =
    clientLimit === null ? `${clientCount} clients` : `${clientCount}/${clientLimit} clients`;

  const row = (item: WorkspaceNavEntry, active: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      data-tour={item.tour}
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
      <span
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-faint group-hover:text-blue-bright"}`}
      >
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
        <Link href="/clients" className="mb-1 px-2 text-[15px] font-light tracking-[0.3em] text-white">
          MAIRO
        </Link>
        {/* The workspace, named. A freelancer's screens are otherwise full of
            client names, and it should never be ambiguous which of the two you
            are looking at. */}
        <p className="mb-6 truncate px-2 font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
          {workspaceName}
        </p>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((i) => row(i, isActive(pathname, i.href)))}
        </nav>

        <div
          className="mb-4 rounded-2xl border p-4"
          style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint">Your plan</p>
          <p className="mt-2 text-[13px] font-medium text-white">{planName}</p>
          <p className="mt-1 text-[11px] text-muted">{usage}</p>
        </div>

        <div className="space-y-1 border-t pt-4" style={{ borderColor: "var(--mairo-line)" }}>
          {footer}
        </div>
      </aside>

      {/* ---- Mobile top bar ---- */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(6,9,20,0.92)" }}
      >
        <Link href="/clients" className="text-[13px] font-light tracking-[0.3em] text-white">
          MAIRO
        </Link>
        <span className="truncate text-[12px] text-faint">{workspaceName}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {usage}
        </span>
      </header>

      {/* pb-24 on mobile so the bottom bar never covers the last control on the
          screen — the single most common way a bottom nav breaks a form. */}
      <main className="px-4 pb-24 pt-5 sm:px-6 lg:ml-[248px] lg:px-10 lg:pb-16 lg:pt-8">
        <div className="mb-6 hidden items-center justify-end gap-4 lg:flex">
          <span
            className="rounded-full border px-3.5 py-1.5 text-[12px] text-muted"
            style={{ borderColor: "var(--mairo-line)" }}
          >
            {planName} · {usage}
          </span>
        </div>
        {children}
      </main>

      {/* ---- Mobile bottom navigation ---- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(6,9,20,0.96)" }}
        aria-label="Primary"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center gap-1 px-1 py-2.5"
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 top-0 h-px"
                  style={{
                    backgroundImage: "var(--mairo-ramp)",
                    boxShadow: "0 0 12px 1px rgba(61,125,255,0.6)",
                  }}
                />
              )}
              <span className={`h-5 w-5 ${active ? "text-blue-bright" : "text-faint"}`}>
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
