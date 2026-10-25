"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { browserOptedOut, pixelAllowedOn, queryAllowed } from "@/lib/site-pixel-paths";

// MAIRO's own Meta pixel, so MAIRO's own ads can be measured: a page view on
// the public pages, and the _fbp cookie that lets Meta match what happens
// next. The conversions themselves (a free plan, a sign-up, a subscription)
// are reported server-side (lib/site-tracking.ts), because they finish on
// pages the pixel stays off.
//
// Loaded only when NEXT_PUBLIC_META_PIXEL_ID is set or a pixel was set up from
// AIOS → Setup, only on the pages
// pixelAllowedOn() names with no parameters but queryAllowed()'s, and never
// for a browser that sends Global Privacy Control or Do Not Track. Two of the pixel's own behaviours are switched off:
// automatic page views on every client-side navigation (disablePushState),
// which would follow a visitor into the dashboard, and automatic event
// detection (autoConfig), which reads buttons and page content.

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function load(pixelId: string) {
  if (window.fbq) return;
  const fbq: Fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  fbq.disablePushState = true;
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("set", "autoConfig", false, pixelId);
  fbq("init", pixelId);
}

// The id set up from AIOS, asked for once per visit and only on a page the
// pixel may run on (app/api/site-pixel). Null: measurement is off.
let fetched: Promise<string | null> | null = null;
function pixelFromServer(): Promise<string | null> {
  fetched ??= fetch("/api/site-pixel")
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { pixelId?: unknown } | null) => (typeof body?.pixelId === "string" && /^\d{6,20}$/.test(body.pixelId) ? body.pixelId : null))
    .catch(() => null);
  return fetched;
}

/** pixelId: the deployment's NEXT_PUBLIC_META_PIXEL_ID, or null to use the one set up from AIOS, if any. */
export function SitePixel({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || !pixelAllowedOn(pathname) || !queryAllowed(window.location.search) || browserOptedOut()) return;
    let cancelled = false;
    void (pixelId ? Promise.resolve(pixelId) : pixelFromServer()).then((id) => {
      if (!id || cancelled) return;
      load(id);
      window.fbq?.("track", "PageView");
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, pixelId]);
  return null;
}

