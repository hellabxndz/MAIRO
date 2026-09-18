"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { TABS, type TabKey } from "./tab-list";

// The tab bar on a campaign.
//
// Tabs are links carrying `?tab=`, not client state. Three reasons, and the
// first is the one that matters: every tab here renders server data — figures,
// creatives, the action log — and state-based tabs would mean fetching all six
// tabs' worth of data on every visit to show one of them.
//
// The other two fall out of it. A tab you can link somebody to is a tab you can
// link somebody to, which is most of what support is; and the back button does
// what people expect instead of leaving the campaign entirely.
//
// Scrolls horizontally on a phone rather than wrapping to two rows or
// collapsing into a select. Six short labels fit in one swipe, and a select
// hides five of the six behind a tap.

export function CampaignTabs({ active }: { active: TabKey }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div
      className="-mx-4 mb-8 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
      style={{ borderColor: "var(--mairo-line)" }}
    >
      <nav className="flex min-w-max gap-1" aria-label="Campaign sections">
        {TABS.map((tab) => {
          const on = tab.key === active;
          const next = new URLSearchParams(params.toString());
          next.set("tab", tab.key);
          return (
            <Link
              key={tab.key}
              href={`${pathname}?${next.toString()}`}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={`relative whitespace-nowrap px-3.5 py-3 text-[13px] transition-colors duration-300 ${
                on ? "text-white" : "text-muted hover:text-white"
              }`}
            >
              {tab.label}
              {/* The underline sits on the container's own border so the two
                  never end up a pixel apart at fractional zoom. */}
              {on && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                  style={{
                    backgroundImage: "var(--mairo-ramp)",
                    boxShadow: "0 0 12px 1px rgba(61,125,255,0.45)",
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
