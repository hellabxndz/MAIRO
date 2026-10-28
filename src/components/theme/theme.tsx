"use client";

import { useEffect, useSyncExternalStore } from "react";

// The light theme and the palette, as attributes on <html> (globals.css does
// the rest). Light is for the signed-in app and AIOS only — the public site's
// pictures are drawn for black — so it's applied inside those two shells and
// taken off again when someone leaves them. Stored in the viewer's browser
// only: a preference, not account data.

const KEY = "mairo-theme";
type Theme = "dark" | "light";

/** Runs before the first paint (root layout) so an app page never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,q=new URLSearchParams(location.search);var p=q.get("palette");if(p==="blue")d.setAttribute("data-palette","blue");if(/^\\/(dashboard|aios)(\\/|$)/.test(location.pathname)){var t=q.get("theme")||localStorage.getItem("${KEY}");if(t==="light")d.setAttribute("data-theme","light");}}catch(e){}})();`;

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function apply(theme: Theme) {
  const d = document.documentElement;
  if (theme === "light") d.setAttribute("data-theme", "light");
  else d.removeAttribute("data-theme");
}

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function subscribeTheme(onChange: () => void) {
  const o = new MutationObserver(onChange);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
}

/** In the app and AIOS shells: the viewer's theme while they're inside, removed when they leave. */
export function AppThemeScope() {
  useEffect(() => {
    if (!document.documentElement.hasAttribute("data-theme")) apply(stored());
    return () => document.documentElement.removeAttribute("data-theme");
  }, []);
  return null;
}

/**
 * The switch. Where the browser supports view transitions and motion is
 * welcome, the new theme spreads out from the switch; otherwise it changes
 * at once. Either way nothing waits on the animation.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark" as Theme);
  const next: Theme = theme === "light" ? "dark" : "light";

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = document.documentElement;
    d.style.setProperty("--mairo-reveal-x", `${r.left + r.width / 2}px`);
    d.style.setProperty("--mairo-reveal-y", `${r.top + r.height / 2}px`);
    const change = () => {
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // A private window: the change still applies for this visit.
      }
    };
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (start && !still) start.call(document, change);
    else change();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`grid h-10 w-10 place-items-center rounded-full border border-[color:var(--mairo-line)] text-neutral-300 transition-colors hover:border-[color:var(--mairo-line-lit)] hover:text-white ${className}`}
    >
      {theme === "light" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      )}
    </button>
  );
}
