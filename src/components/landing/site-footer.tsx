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
        ["See MAIRO at work", "/#product-preview"],
        ["Your AI team", "/#ai-team"],
        ["Performance Coach", "/#performance-coach"],
        ["Pricing", "/#pricing"],
      ],
    },
    {
      h: "Resources",
      l: [
        ...(toolsLive ? ([["Free tools", "/tools"]] as [string, string][]) : []),
        ["Your free plan", "/#free-plan"],
        ["Money and control", "/#control"],
        ["Integrations", "/#integrations"],
        ["FAQ", "/#faq"],
        ["Sign up as a freelancer or agency", "/for-freelancers"],
      ],
    },
    { h: "Company", l: [["Sign in", "/sign-in"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Data deletion", "/data-deletion"]] },
  ];
  return (
    <footer className="border-t border-white/[0.06] px-5 py-14 sm:px-8">
      <div className="mx-auto grid max-w-[1360px] grid-cols-2 gap-10 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Wordmark href={null} className="text-[18px]" />
          <p className="mt-3 max-w-[240px] text-[13px] leading-relaxed text-white/50">Your AI Advertising Team for Facebook &amp; Instagram. You run the business — your AI team handles the advertising.</p>
          <p className="mt-3 text-[12.5px] text-white/55">Questions? <a href={`mailto:${LEGAL.contactEmail}`} className="underline underline-offset-4 hover:text-white">{LEGAL.contactEmail}</a></p>
          <p className="mt-4 text-[12px] leading-relaxed text-white/45">
            {LEGAL.productName} is operated by {LEGAL.companyName}
            {LEGAL.companyAddress ? `, ${LEGAL.companyAddress}` : ""}.
            <br />© {new Date().getFullYear()} {LEGAL.companyName}
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.h}>
            <p className="text-[13px] font-semibold text-white">{col.h}</p>
            <ul className="mt-4 space-y-2.5 text-[13px] text-white/55">
              {col.l.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
