// Before MAIRO, and with it: the same five decisions every Meta campaign
// needs, made by the owner alone — or described once, reviewed as a plan
// and approved.

const BEFORE = [
  { k: "Objective", q: "Sales, traffic or engagement — which one actually brings orders?" },
  { k: "Audience", q: "Interests, lookalikes, broad — and how narrow is too narrow?" },
  { k: "Budget", q: "How much a day, split how, and when to change it?" },
  { k: "Creative", q: "What to say, what to show, and which version to test?" },
  { k: "Tracking", q: "Is the pixel working, and what is it actually counting?" },
];

const AFTER = [
  { n: "1", t: "Describe your business.", d: "Your website, your Instagram, or a sentence." },
  { n: "2", t: "Review the plan.", d: "Strategy, audience, budget split and ad concepts — each with its reason." },
  { n: "3", t: "Approve your campaigns.", d: "MAIRO builds them in your own Meta ad account. Nothing runs until you say so." },
];

export function BeforeAfter() {
  return (
    <section id="before-after" aria-labelledby="ba-title" className="relative mx-auto max-w-[1280px] scroll-mt-20 px-4 py-16 sm:px-8 sm:py-24 lg:px-12">
      <div data-reveal className="mx-auto max-w-[760px] text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">Before and after</p>
        <h2 id="ba-title" className="mt-3 text-[clamp(28px,3.6vw,46px)] font-semibold leading-[1.04] tracking-[-0.035em] text-white [text-wrap:balance]">
          The same decisions. Far less to figure out.
        </h2>
      </div>
      <div data-reveal className="mt-12 grid gap-4 lg:grid-cols-2">
        <article className="rounded-[26px] border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">Before</p>
          <p className="mt-3 text-[clamp(19px,2vw,24px)] font-medium leading-snug text-white/80">&ldquo;I need to figure out my campaign objective, audience, budget, creative, and tracking.&rdquo;</p>
          <ul className="mt-6 space-y-2.5">
            {BEFORE.map((b) => (
              <li key={b.k} className="flex gap-3 rounded-2xl border border-dashed border-white/[0.1] px-4 py-3">
                <span className="w-[78px] shrink-0 text-[13px] font-medium text-white/55">{b.k}</span>
                <span className="text-[13.5px] leading-snug text-white/55">{b.q}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="relative overflow-hidden rounded-[26px] border p-6 sm:p-8" style={{ borderColor: "rgba(47,107,255,0.4)", background: "radial-gradient(90% 80% at 100% 0%, rgba(47,107,255,0.22), transparent 60%), rgba(255,255,255,0.02)" }}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300">With MAIRO</p>
          <p className="mt-3 text-[clamp(19px,2vw,24px)] font-semibold leading-snug text-white">Describe your business. Review the plan. Approve your campaigns.</p>
          <ol className="mt-6 space-y-3">
            {AFTER.map((a) => (
              <li key={a.n} className="flex gap-4 rounded-2xl bg-white/[0.04] px-4 py-3.5">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] text-[13px] font-semibold text-white">{a.n}</span>
                <span>
                  <span className="block text-[15px] font-semibold text-white">{a.t}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-relaxed text-white/65">{a.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
}
