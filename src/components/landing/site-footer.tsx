import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { LEGAL } from "@/lib/legal";

// The public footer (v3 "Signal"): quiet, on the same near-black as the
// homepage, every link one tap away and every link to something that exists.
// Anchors point at the homepage's own sections (#how, #one-mairo, #example,
// #control) and the pricing page's (#faq, #integrations).

export function SiteFooter({ toolsLive = false }: { toolsLive?: boolean }) {
  const columns: { h: string; l: [string, string][] }[] = [
    {
      h: "Product",
      l: [
        ["How it works", "/#how"],
        ["One MAIRO", "/#one-mairo"],
        ["An example", "/#example"],
        ["You stay in control", "/#control"],
        ["Pricing", "/pricing"],
      ],
    },
    {
      h: "Resources",
      l: [
        ["See your free plan", "/preview"],
        ...(toolsLive ? ([["Free advertising tools", "/tools"]] as [string, string][]) : []),
        ["Help center", "/help"],
        ["FAQ", "/pricing#faq"],
        ["Integrations", "/pricing#integrations"],
      ],
    },
    {
      h: "Built for",
      l: [
        ["Local services", "/solutions/local-services"],
        ["Appointments", "/solutions/appointments"],
        ["Online stores", "/solutions/online-stores"],
      ],
    },
    { h: "Company", l: [["Sign in", "/sign-in"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Data deletion", "/data-deletion"]] },
  ];
  return (
    <footer className="relative border-t border-[color:var(--v3-line)] bg-[color:var(--v3-ink)]">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-2 gap-10 px-5 py-16 sm:grid-cols-5 sm:px-10 lg:px-16">
        <div className="col-span-2 sm:col-span-1">
          <Wordmark href={null} className="text-[15px]" />
          <p className="mt-4 max-w-[240px] text-[13px] leading-relaxed text-[color:var(--v3-text-3)]">One AI that runs your Facebook &amp; Instagram ads, with your approval.</p>
          <p className="mt-4 text-[12.5px] text-[color:var(--v3-text-3)]">
            Support: <a href={`mailto:${LEGAL.contactEmail}`} className="underline underline-offset-4 hover:text-white">{LEGAL.contactEmail}</a>
          </p>
          <p className="mt-4 text-[12px] leading-relaxed text-white/35">
            {LEGAL.productName} is operated by {LEGAL.companyName}
            {LEGAL.companyAddress ? `, ${LEGAL.companyAddress}` : ""}
            <br />© {new Date().getFullYear()} {LEGAL.companyName}
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.h}>
            <p className="v3-label">{col.h}</p>
            {/* Each link a full 44px row on a phone; the desktop list stays tight. */}
            <ul className="mt-2 text-[13.5px] text-white/60 sm:mt-4 sm:space-y-2.5">
              {col.l.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="flex min-h-11 items-center transition hover:text-white sm:pointer-fine:inline sm:pointer-fine:min-h-0">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
