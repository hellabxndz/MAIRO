import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { brandFont } from "@/lib/fonts";
import { PLANS } from "@/lib/plans";
import { TOOL_CONTENT } from "@/lib/tools/content";
import { ToolLoader } from "@/components/tools/tool-loader";
import { TOOLS, tool, usable } from "@/lib/tools/registry";

// One page per working tool. A tool that isn't built has no page at all
// (dynamicParams = false), so search engines never index a placeholder.

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.filter(usable).map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const t = tool(slug);
  if (!t || !usable(t)) return {};
  return { title: `${t.name} — free tool`, description: t.summary, alternates: { canonical: `/tools/${t.slug}` } };
}

const BUSINESS_PLANS = PLANS.map((p) => ({ id: p.tier, name: p.name, price: p.priceMonthly }));
const NAMES = Object.fromEntries(TOOLS.filter(usable).map((t) => [t.slug, t.name]));


const PROCESSING = {
  browser: "Runs in your browser. What you type stays on this device — saved here so it's still there next time. MAIRO only receives a result if you choose to use it when you set up your plan.",
  server: "MAIRO's server reads the public pages you name. The reading is kept for a few hours so a repeat check is quick, counted against a free limit by a one-way code — your IP address isn't stored, and no account is needed.",
  ai: "What you enter is sent to MAIRO's server and an AI provider to write the result.",
} as const;

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  const { slug } = await params;
  const t = tool(slug);
  const content = TOOL_CONTENT[slug];
  // check:capabilities proves every usable tool has its content and a component in ToolLoader.
  if (!t || !usable(t) || !content) notFound();
  const related = content.related.map(tool).filter((r): r is NonNullable<typeof r> => Boolean(r && usable(r)));
  return (
    <div className={`${brandFont.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav toolsLive />
      <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-[104px] sm:px-8 sm:pt-[124px]">
        <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
          <Link href="/tools" className="hover:text-white">Free tools</Link> <span aria-hidden>/</span> <span>{t.category}</span>
        </nav>
        <h1 className="mt-3 text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] text-white sm:text-[40px]">{t.name}</h1>
        <p className="mt-3 max-w-[760px] text-[15.5px] leading-relaxed text-white/75">{content.intro}</p>
        <p className="mt-3 inline-flex max-w-[760px] items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] leading-relaxed text-white/65">
          <span aria-hidden>{t.processing === "browser" ? "🔒" : "ⓘ"}</span>
          {PROCESSING[t.processing]}
        </p>

        <div className="mt-8">
          <ToolLoader slug={slug} plans={BUSINESS_PLANS} toolNames={NAMES} />
        </div>

        <section aria-labelledby="method" className="mt-14 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 id="method" className="text-[20px] font-semibold text-white">How it works</h2>
            <dl className="mt-4 space-y-3">
              {content.method.map((m) => (
                <div key={m.label} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <dt className="text-[13.5px] font-medium text-white">{m.label}</dt>
                  <dd className="mt-0.5 text-[13.5px] leading-relaxed text-white/70">{m.text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="text-[20px] font-semibold text-white">What it doesn&rsquo;t tell you</h2>
            <ul className="mt-4 space-y-2">
              {content.limits.map((l) => (
                <li key={l} className="text-[13.5px] leading-relaxed text-white/70">{l}</li>
              ))}
            </ul>
            {related.length > 0 && (
              <>
                <h2 className="mt-8 text-[16px] font-semibold text-white">Related tools</h2>
                <ul className="mt-3 space-y-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link href={`/tools/${r.slug}`} className="text-[14px] text-violet-bright underline underline-offset-4 hover:text-white">{r.name}</Link>
                      <p className="text-[12.5px] text-white/55">{r.summary}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter toolsLive />
    </div>
  );
}
