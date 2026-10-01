import Link from "next/link";

// The Social Manager sections, one row of tabs across every Social page.

const TABS = [
  { href: "/dashboard/social", label: "Overview" },
  { href: "/dashboard/social/calendar", label: "Content Calendar" },
  { href: "/dashboard/social/promotions", label: "Promotions" },
  { href: "/dashboard/social/performance", label: "Performance" },
  { href: "/dashboard/social/instagram", label: "Instagram" },
  { href: "/dashboard/social/facebook", label: "Facebook" },
] as const;

export function SocialTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Social Manager" className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition ${
            t.href === active ? "bg-[#7c5cff] text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
