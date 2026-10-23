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
// Loaded only when NEXT_PUBLIC_META_PIXEL_ID is set, only on the pages
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

export function SitePixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || !pixelAllowedOn(pathname) || !queryAllowed(window.location.search) || browserOptedOut()) return;
    load(pixelId);
    window.fbq?.("track", "PageView");
  }, [pathname, pixelId]);
  return null;
}

