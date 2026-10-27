import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { AmbientSky } from "@/components/ambient-sky";
import { brandFont } from "@/lib/fonts";
import { USABLE_TOOLS } from "@/lib/tools/registry";

// Any address that isn't a page, and any notFound() without a closer
// not-found.tsx. In the site's own chrome rather than Next's default, which
// is a bare light page that reads as a different product (or a broken one).
// It offers the three places a lost visitor most likely meant.

// Next adds the noindex itself for a 404.
export const metadata: Metadata = { title: "Page not found" };

const WAYS = [
  { href: "/preview", label: "See your free plan", hint: "A Meta ad strategy for your business, in a few minutes" },
  { href: "/#how-it-works", label: "See how MAIRO works", hint: "The five steps, from your business to results" },
  { href: "/help", label: "Help center", hint: "Approvals, billing, Meta and your account" },
];

export default function NotFound() {
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative isolate flex min-h-screen flex-col overflow-x-clip bg-paper text-white`}>
      <AmbientSky />
      <LandingNav toolsLive={toolsLive} />
      <main className="flex flex-1 items-center px-4 pb-20 pt-[120px] sm:px-8">
        <div className="mx-auto w-full max-w-[640px] text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">404</p>
          <h1 className="mt-3 text-[clamp(30px,4.4vw,48px)] font-semibold leading-[1.05] tracking-[-0.04em] [text-wrap:balance]">
            This page isn&rsquo;t here.
          </h1>
          <p className="mx-auto mt-4 max-w-[480px] text-[16px] leading-relaxed text-white/65">
            The address may be mistyped, or the page has moved. Nothing about your account or your ads has changed.
          </p>
          <ul className="mt-9 grid gap-3 text-left">
            {WAYS.map((w) => (
              <li key={w.href}>
                <Link
                  href={w.href}
                  className="group flex min-h-[64px] items-center justify-between gap-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] px-5 py-3.5 transition hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-white">{w.label}</span>
                    <span className="mt-0.5 block text-[13px] text-white/55">{w.hint}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white">&rarr;</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[14px] text-white/55">
            <Link href="/" className="inline-flex min-h-[44px] items-center text-cyan-200 underline-offset-4 hover:text-white hover:underline">Go to the homepage</Link>
          </p>
        </div>
      </main>
      <SiteFooter toolsLive={toolsLive} />
    </div>
  );
}
