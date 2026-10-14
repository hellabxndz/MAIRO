import { RENDERED_MEDIA } from "@/lib/demo/media";
import { WALK_CAPTIONS, WALK_DURATION, WALK_SCENES } from "@/lib/demo/walkthrough";
import { LazyWalkthrough } from "./lazy-walkthrough";

// "See MAIRO in action": the product demo on the landing page, with the whole
// script beneath it for anyone who'd rather read.

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function WalkthroughSection() {
  return (
    <section id="walkthrough" aria-labelledby="walkthrough-title" data-palette="classic" className="relative isolate scroll-mt-20 overflow-hidden bg-[#07080D] py-20 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_50%_at_50%_30%,rgba(121,82,255,0.2),transparent_70%),radial-gradient(ellipse_40%_35%_at_80%_90%,rgba(53,108,255,0.12),transparent_70%)]" />
      <div className="mx-auto max-w-[1100px] px-4 sm:px-8">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#c4b5fd]">The MAIRO demo · {fmt(WALK_DURATION)}</p>
          <h2 id="walkthrough-title" className="mt-3 text-[clamp(30px,4.2vw,52px)] font-semibold leading-[1.02] tracking-[-0.04em] [text-wrap:balance]">Watch MAIRO in Action</h2>
          <p className="mx-auto mt-3 max-w-[620px] text-[15.5px] leading-relaxed text-white/70">One sample business, from its free plan to its first results, in seven chapters — played on MAIRO&rsquo;s own screens. No voice-over yet: the captions carry the script, and you can jump to any chapter.</p>
        </div>
        <div className="mx-auto mt-10 max-w-[1000px]">
          <LazyWalkthrough media={{ walkthrough: RENDERED_MEDIA.walkthrough, captions: RENDERED_MEDIA.captions }} />
          <details className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none py-1 text-[14px] font-medium text-white">Read the script instead</summary>
            <div className="mt-2 space-y-4 pb-2">
              {WALK_SCENES.map((s) => (
                <div key={s.id}>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#c4b5fd]">{s.label}</p>
                  <ul className="mt-1 space-y-1">
                    {WALK_CAPTIONS.filter((c) => c.start >= s.start && c.start < s.end).map((c) => (
                      <li key={c.start} className="text-[13.5px] leading-relaxed text-white/75">
                        <span className="mr-2 tabular-nums text-white/45">{fmt(c.start)}</span>
                        {c.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-[12px] text-white/50">Brightwater Plumbing is invented; every figure is sample data.</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
