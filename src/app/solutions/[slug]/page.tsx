import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { ExamplePlan } from "@/components/solutions/example-plan";
import { brandFont } from "@/lib/fonts";
import { USE_CASES, findUseCase } from "@/lib/solutions/use-cases";
import { buildPreview } from "@/lib/preview/build";
import { exampleFacts } from "@/lib/preview/example";
import { EXAMPLES } from "@/lib/demo/examples";
import { helpArticle } from "@/lib/help/articles";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import { USABLE_TOOLS } from "@/lib/tools/registry";

// One page per kind of business MAIRO's free plan is built around. What MAIRO
// sets up is read from the plan the preview builder really makes for that
// kind — on an invented example business, labelled — and what it measures and
// doesn't do is in lib/solutions/use-cases.ts.

export const dynamicParams = false;

export function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: PageProps<"/solutions/[slug]">): Promise<Metadata> {
  const u = findUseCase((await params).slug);
  if (!u) return {};
  return { title: u.title, description: u.sub, alternates: { canonical: `/solutions/${u.slug}` } };
}

export default async function UseCasePage({ params }: PageProps<"/solutions/[slug]">) {
  const u = findUseCase((await params).slug);
  if (!u) notFound();
  const plan = buildPreview(exampleFacts(u.example))!;
  const ex = EXAMPLES[u.example];
  const help = u.help.map(helpArticle).filter((a) => a !== null);
  const toolsLive = USABLE_TOOLS().length > 0;
  const starter = PLANS[0];
  const cta = `/preview?goal=${plan.goal}`;

  const setsUp = [
    { term: "Objective", text: plan.plan.objective },
    { term: "Judged on", text: plan.firstCampaign.judgedOn },
    { term: "Where people go", text: plan.kind === "shop" ? `Your website (${plan.plan.destination})` : plan.plan.destination },
    { term: "Tracking", text: plan.tracking.events.map((e) => `${e.name}${e.required ? "" : " (optional)"}`).join(", ") },
    { term: "Ad directions", text: plan.directions.map((d) => d.label).join(" · ") },
  ];

  return (
    <div className={`${brandFont.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav toolsLive={toolsLive} />
      <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-[110px] sm:px-8 sm:pt-[130px]">
        <nav aria-label="Solutions" className="flex flex-wrap gap-2">
          {USE_CASES.map((o) => (
            <Link key={o.slug} href={`/solutions/${o.slug}`} aria-current={o.slug === u.slug ? "page" : undefined} className={`min-h-[36px] rounded-full border px-3.5 py-1.5 text-[13px] transition ${o.slug === u.slug ? "border-violet/60 bg-violet/[0.12] text-white" : "border-white/12 text-white/70 hover:border-white/30 hover:text-white"}`}>
              {o.label}
            </Link>
          ))}
        </nav>

        <header className="mt-8 max-w-[800px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Solutions · {u.label}</p>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-white [text-wrap:balance] sm:text-[46px]">{u.title}</h1>
          <p className="mt-4 text-[16.5px] leading-relaxed text-white/75">{u.sub}</p>
          <p className="mt-3 text-[14px] text-white/55">For {u.forWho.map((w) => w.charAt(0).toLowerCase() + w.slice(1)).join("; ")}.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={cta} className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-7 text-[15px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110">
              Build My Free Ad Plan <span aria-hidden>→</span>
            </Link>
            <Link href={`/preview?example=${u.example}`} className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-white/15 px-6 text-[15px] font-medium text-white transition hover:border-violet-400/60">
              Open the full example
            </Link>
          </div>
          <p className="mt-3 text-[12.5px] text-white/50">Free, no card. A subscription is needed only to build and run campaigns — from ${starter.priceMonthly}/month, {STARTER_TRIAL_DAYS}-day trial on {starter.name}.</p>
        </header>

        <section aria-labelledby="sets-up" className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <h2 id="sets-up" className="text-[24px] font-semibold tracking-[-0.02em] text-white">What MAIRO sets up</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-white/70">
              From the plan MAIRO builds for {ex.name}, a fictional {ex.label.toLowerCase()}. Yours is built from your own website or answers, and you confirm everything before it&rsquo;s used.
            </p>
            <dl className="mt-5 divide-y divide-[color:var(--mairo-line)] rounded-2xl border border-[color:var(--mairo-line)]">
              {setsUp.map((s) => (
                <div key={s.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[13px] font-semibold text-white">{s.term}</dt>
                  <dd className="text-[14px] leading-relaxed text-white/75">{s.text}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/50">{plan.plan.budgetWhy}</p>
          </div>
          <ExamplePlan example={u.example} />
        </section>

        <section aria-labelledby="measured" className="mt-16 grid gap-10 md:grid-cols-2">
          <div>
            <h2 id="measured" className="text-[24px] font-semibold tracking-[-0.02em] text-white">How results are counted</h2>
            <dl className="mt-5 space-y-4">
              {u.measured.map((m) => (
                <div key={m.term} className="rounded-2xl border border-[color:var(--mairo-line)] bg-white/[0.03] p-4">
                  <dt className="text-[14.5px] font-semibold text-white">{m.term}</dt>
                  <dd className="mt-1 text-[14px] leading-relaxed text-white/72">{m.text}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-white/55">Until a source is connected, the figure shows as missing and says why — never an estimate.</p>
          </div>
          <div className="space-y-10">
            <div>
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-white">What you&rsquo;ll need</h2>
              <ul className="mt-5 space-y-3">
                {u.need.map((n) => (
                  <li key={n} className="flex gap-3 text-[14.5px] leading-relaxed text-white/78">
                    <span aria-hidden className="mt-[3px] text-emerald-300">✓</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-white">What MAIRO doesn&rsquo;t do</h2>
              <ul className="mt-5 space-y-3">
                {u.notDone.map((n) => (
                  <li key={n} className="flex gap-3 text-[14.5px] leading-relaxed text-white/78">
                    <span aria-hidden className="mt-[3px] text-white/40">—</span>
                    <span>{n}</span>
                  </li>
                ))}
                <li className="flex gap-3 text-[14.5px] leading-relaxed text-white/78">
                  <span aria-hidden className="mt-[3px] text-white/40">—</span>
                  <span>Nothing launches and nothing is spent until you approve it, on any plan.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {help.length > 0 && (
          <section aria-labelledby="uc-help" className="mt-16">
            <h2 id="uc-help" className="text-[18px] font-semibold text-white">
              Questions people ask
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {help.map((a) => (
                <li key={a.slug}>
                  <Link href={`/help/${a.slug}`} className="block h-full rounded-2xl border border-[color:var(--mairo-line)] bg-white/[0.03] p-4 transition hover:border-violet/45">
                    <span className="block text-[14.5px] font-semibold text-white">{a.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-white/65">{a.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-16 rounded-[28px] border border-violet/30 bg-gradient-to-br from-[#4f7dff]/[0.08] to-[#2fa4ff]/[0.12] px-6 py-12 text-center sm:px-10">
          <h2 className="mx-auto max-w-[680px] text-[26px] font-semibold leading-tight tracking-[-0.025em] text-white sm:text-[34px]">See the plan MAIRO would build for your business.</h2>
          <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-relaxed text-white/70">Start with your website or a few words about what you do. Free, and nothing runs until you approve it.</p>
          <Link href={cta} className="mt-7 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-8 text-[15.5px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110">
            Build My Free Ad Plan <span aria-hidden>→</span>
          </Link>
        </section>
      </main>
      <SiteFooter toolsLive={toolsLive} />
    </div>
  );
}
