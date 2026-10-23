import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { LEGAL } from "@/lib/legal";

// The public footer, shared by the landing page and the free tools. Links are
// absolute so they work from any public page; the long tail of links lives
// here so the top bar can stay at five.

export function SiteFooter({ toolsLive = false }: { toolsLive?: boolean }) {
  const columns: { h: string; l: [string, string][] }[] = [
    {
      h: "Product",
      l: [
        ["How it works", "/#how-it-works"],
        ["Creative showcase", "/#showcase"],
        ["Dashboard & results", "/#dashboard"],
        ["Your AI team & approvals", "/#ai-team"],
        ["Pricing", "/pricing"],
      ],
    },
    {
      h: "Resources",
      l: [
        ["Build your free ad plan", "/preview"],
        ...(toolsLive ? ([["Free advertising tools", "/tools"]] as [string, string][]) : []),
        ["Watch MAIRO in action", "/#film"],
        ["Security & control", "/#control"],
        ["Integrations", "/#integrations"],
        ["FAQ", "/#faq"],
        ["Help center", "/help"],
      ],
    },
    { h: "Company", l: [["Online stores", "/solutions/online-stores"], ["Local services", "/solutions/local-services"], ["Appointments", "/solutions/appointments"], ["Sign in", "/sign-in"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Data deletion", "/data-deletion"]] },
  ];
  return (
    <footer className="relative border-t border-white/[0.07] px-5 py-16 sm:px-8">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),rgba(210,210,210,0.3),transparent)]" />
      <div className="mx-auto grid max-w-[1360px] grid-cols-2 gap-10 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Wordmark href={null} className="text-[18px]" />
          <p className="mt-3 max-w-[260px] text-[13px] leading-relaxed text-white/50">Your entire AI advertising team for Facebook &amp; Instagram — strategy, creative, campaigns and results, approved by you.</p>
          <p className="mt-3 text-[12.5px] text-white/55">Support: <a href={`mailto:${LEGAL.contactEmail}`} className="underline underline-offset-4 hover:text-white">{LEGAL.contactEmail}</a></p>
          <p className="mt-4 text-[12px] leading-relaxed text-white/45">
            {LEGAL.productName} is operated by {LEGAL.companyName}
            {LEGAL.companyAddress ? `, ${LEGAL.companyAddress}` : ""}.
            <br />© {new Date().getFullYear()} {LEGAL.companyName}
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.h}>
            <p className="text-[13px] font-semibold text-white">{col.h}</p>
            {/* Each link a full 44px row on a phone; the desktop list stays tight. */}
            <ul className="mt-2 text-[13px] text-white/55 sm:mt-4 sm:space-y-2.5">
              {col.l.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="flex min-h-11 items-center hover:text-white sm:inline sm:min-h-0">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
