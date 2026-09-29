import type { NavEntry } from "@/components/mairo/app-shell";

// Extra sidebar entries for a free-plan account before subscribing.
const icon = (d: string) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export function FREE_NAV(approved: boolean): NavEntry[] {
  return [
    { href: "/plan", label: "My Free Plan", icon: icon("M5 3.5h7l3 3v10H5z M12 3.5v3h3 M7.5 10h5 M7.5 13h5") },
    { href: approved ? "/plan/activate" : "/plan", label: "Pricing", icon: icon("M3.5 10.5l7-7h6v6l-7 7z M13 7h.01") },
  ];
}
