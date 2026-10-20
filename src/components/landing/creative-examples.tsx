import Link from "next/link";
import { BusinessArt } from "@/components/hero-story/art";
import { EXAMPLES, EXAMPLE_ORDER } from "@/lib/demo/examples";

// "What could MAIRO create?" — three invented businesses and the three ad
// directions MAIRO would draft for each, with the first one to test. Drawn
// 3D product renders made for the site, not generated pictures or photos of real customers, and
// labelled as examples throughout.

export function CreativeExamples() {
  return (
    <section id="examples" aria-labelledby="examples-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[760px] text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-300">Example ads</p>
        <h2 id="examples-title" className="mt-3 text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] [text-wrap:balance]">Three businesses. Three ways to start.</h2>
        <p className="mx-auto mt-3 max-w-[640px] text-[15.5px] leading-relaxed text-white/65">
          For every business, MAIRO drafts three different reasons to stop scrolling — the work itself, the problem it solves, the offer — and picks one to test first. These businesses are invented; the pictures are 3D product renders, not photographs.
        </p>
      </div>
      <ul className="mx-auto mt-12 grid max-w-[1180px] grid-cols-1 gap-5 lg:grid-cols-3">
        {EXAMPLE_ORDER.map((k) => {
          const ex = EXAMPLES[k];
          const first = ex.concepts[ex.selected];
          return (
            <li key={k} className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
              <div className="relative aspect-[4/3]">
                <BusinessArt type={k} variant={first.art} className="absolute inset-0 h-full w-full" />
                <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-amber-200">Example — sample business</span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-[12px] text-white/55">
                  {ex.label} · <span className="text-white/75">{ex.name}</span>
                </p>
                <p className="mt-3 inline-flex self-start rounded-full bg-violet-500/[0.12] px-2.5 py-0.5 text-[11px] font-semibold text-violet-300">Recommended first test · {first.angle}</p>
                <p className="mt-2 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-white">&ldquo;{first.hook}&rdquo;</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/65">{first.body}</p>
                <ul className="mt-4 space-y-2 border-t border-white/10 pt-4">
                  {ex.concepts
                    .filter((_, i) => i !== ex.selected)
                    .map((c) => (
                      <li key={c.id} className="text-[13px] leading-snug">
                        <span className="text-white/50">{c.angle}:</span> <span className="text-white/85">&ldquo;{c.hook}&rdquo;</span>
                      </li>
                    ))}
                </ul>
                <Link href={`/preview?example=${k}`} className="mt-5 self-start text-[13.5px] font-medium text-violet-300 underline-offset-4 hover:text-white hover:underline">
                  See this example&rsquo;s full preview →
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
