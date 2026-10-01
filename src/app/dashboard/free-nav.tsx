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

const SOCIAL_ICON = icon("M4 5.5h12v9H4z M4 8.5h12 M7.5 3.5v3 M12.5 3.5v3 M7 11.5h2 M11 11.5h2");

/** Scale (active): MAIRO Social Manager. */
export const SOCIAL_NAV: NavEntry[] = [
  { href: "/dashboard/social", label: "Social Manager", group: "Social", exact: true, icon: icon("M10 3.5l1.9 4.1 4.4.5-3.3 3 1 4.4L10 13.3l-4 2.2 1-4.4-3.3-3 4.4-.5z") },
  { href: "/dashboard/social/calendar", label: "Content Calendar", group: "Social", icon: SOCIAL_ICON },
  { href: "/dashboard/social/promotions", label: "Promotions", group: "Social", icon: icon("M3.5 10.5l7-7h6v6l-7 7z M13 7h.01") },
  {
    href: "/dashboard/social/instagram",
    label: "Instagram posts",
    group: "Social",
    icon: icon("M6 3h8a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z M10 13.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z M14.3 5.8h.01"),
  },
  {
    href: "/dashboard/social/facebook",
    label: "Facebook posts",
    group: "Social",
    icon: icon("M10 17.5a7.5 7.5 0 110-15 7.5 7.5 0 010 15z M11.2 17.4V11h2l.3-2.3h-2.3V7.4c0-.7.2-1.1 1.1-1.1h1.2V4.2a15 15 0 00-1.8-.1c-1.8 0-2.9 1.1-2.9 3v1.6H6.8V11h2v6.3"),
  },
];

/** Every other plan: Social Manager shown, locked, labelled Scale. */
export const SOCIAL_LOCKED_NAV: NavEntry = {
  href: "/dashboard/social",
  label: "Social Manager",
  badge: "Scale",
  icon: icon("M10 3.5l1.9 4.1 4.4.5-3.3 3 1 4.4L10 13.3l-4 2.2 1-4.4-3.3-3 4.4-.5z"),
};
