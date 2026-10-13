import { CAPABILITIES, type Capability } from "@/lib/capabilities";

// What MAIRO can do today, straight from the capability matrix
// (lib/capabilities.ts, checked by npm run check:capabilities) — so this list
// can't claim more than the code does. Working features use their approved
// sentence; partial ones say what they still depend on; anything not built
// yet is named as not available, never implied.

const AREAS: Capability["area"][] = ["Plan", "Campaigns", "Creative", "Tracking", "Results", "Control"];

export function VerifiedCapabilities() {
  // Working with a public sentence; partial only when its limit can be said to an owner.
  const shown = CAPABILITIES.filter((c) => AREAS.includes(c.area) && c.claim && (c.status === "working" || (c.status === "partial" && c.publicNote)));
  const notYet = CAPABILITIES.filter((c) => AREAS.includes(c.area) && c.status === "unavailable");
  return (
    <section id="capabilities" aria-labelledby="capabilities-title" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[760px] text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-300">What works today</p>
        <h2 id="capabilities-title" className="mt-3 text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.1] tracking-[-0.035em] [text-wrap:balance]">What MAIRO does — and what it doesn&rsquo;t do yet.</h2>
        <p className="mx-auto mt-3 max-w-[640px] text-[15.5px] leading-relaxed text-white/65">Every line here is checked against the product. Where something depends on a connection or an approval, it says so.</p>
      </div>
      <div className="mx-auto mt-12 grid max-w-[1180px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((area) => {
          const items = shown.filter((c) => c.area === area);
          if (!items.length) return null;
          return (
            <div key={area} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">{area}</h3>
              <ul className="mt-3 space-y-3">
                {items.map((c) => (
                  <li key={c.id} className="flex gap-2.5 text-[14px] leading-relaxed">
                    <span aria-hidden className={`mt-[3px] text-[12px] ${c.status === "working" ? "text-emerald-400" : "text-amber-400"}`}>{c.status === "working" ? "✓" : "◐"}</span>
                    <span>
                      <span className="text-white/85">{c.claim}</span>
                      {c.status !== "working" && c.publicNote && <span className="mt-0.5 block text-[12.5px] text-white/55">{c.publicNote}</span>}
                      <span className="sr-only">{c.status === "working" ? " (works today)" : " (works, with the limit shown)"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {notYet.length > 0 && (
        <p className="mx-auto mt-6 max-w-[1180px] rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 text-[13.5px] leading-relaxed text-white/65">
          <span className="font-semibold text-white">Not available yet:</span> {notYet.map((c) => c.name).join(", ")}. MAIRO advertises on Facebook and Instagram only.
        </p>
      )}
      <p className="mx-auto mt-4 flex max-w-[1180px] flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-white/50">
        <span><span aria-hidden className="text-emerald-400">✓</span> Works today</span>
        <span><span aria-hidden className="text-amber-400">◐</span> Works, with the limit shown</span>
      </p>
    </section>
  );
}
