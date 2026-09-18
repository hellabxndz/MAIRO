import { Reveal } from "@/components/reveal";

// What advertising normally costs somebody, before they have spent a penny on
// it.
//
// The argument is made by arrangement rather than by copy: eight separate
// things a business currently has to hold together, drawn as eight separate
// cards that do not touch, and then one panel underneath that is all of them.
// Somebody scrolling past without reading a word should still come away with
// "that was a mess, this is one thing".
//
// The cards are deliberately inert and colourless. They are the status quo,
// and the status quo should not look appealing sitting next to the product.
// The only lit object on the screen is the one at the bottom.

const SCATTERED: { name: string; kind: string }[] = [
  { name: "Meta Ads Manager", kind: "Platform" },
  { name: "TikTok Ads Manager", kind: "Platform" },
  { name: "An agency", kind: "Retainer" },
  { name: "A freelancer", kind: "Hourly" },
  { name: "A designer", kind: "Per asset" },
  { name: "A copywriter", kind: "Per asset" },
  { name: "Analytics dashboards", kind: "Another login" },
  { name: "Spreadsheets", kind: "Yours to maintain" },
];

export function ProblemSection() {
  return (
    <section id="the-problem" className="relative px-6 py-32 sm:px-10 sm:py-44">
      <div className="mx-auto max-w-[1200px]">
        <Reveal>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-blue-bright/80">
            What it takes today
          </p>
          <h2 className="mt-5 max-w-3xl text-[clamp(28px,4.8vw,52px)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
            Running ads shouldn&rsquo;t require becoming an advertiser.
          </h2>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted">
            Right now it takes a platform you have to learn, people you have to brief, and a
            spreadsheet you have to keep. Every one of them is a separate bill, a separate
            login and a separate thing to chase.
          </p>
        </Reveal>

        {/* The eight. Flat, unlit, and not connected to each other — which is
            the point being made. */}
        <Reveal delay={0.15}>
          <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {SCATTERED.map((item) => (
              <div
                key={item.name}
                className="rounded-2xl border p-4"
                style={{
                  borderColor: "rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.015)",
                }}
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">
                  {item.kind}
                </p>
                <p className="mt-2 text-[13.5px] leading-snug text-white/55">{item.name}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* The converge. A single line down the middle rather than eight,
            because eight lines is a diagram and one line is a conclusion. */}
        <Reveal delay={0.3}>
          <div className="relative mx-auto mt-10 flex h-16 w-px justify-center">
            <span
              aria-hidden
              className="block h-full w-px"
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, rgba(122,162,255,0.05), rgba(122,162,255,0.55))",
              }}
            />
          </div>

          <div
            className="relative overflow-hidden rounded-[var(--radius-panel)] border p-7 sm:p-10"
            style={{
              borderColor: "rgba(108,158,255,0.42)",
              backgroundImage:
                "linear-gradient(158deg, rgba(28,48,104,0.55), rgba(9,15,36,0.72))",
              boxShadow:
                "0 0 0 1px rgba(80,130,235,0.12), 0 0 40px rgba(61,125,255,0.2), 0 24px 60px rgba(2,6,18,0.6)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(61,125,255,0.55), transparent 70%)" }}
            />
            <div className="relative">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-blue-bright/90">
                One system
              </p>
              <h3 className="mt-4 max-w-2xl text-[clamp(20px,2.6vw,30px)] font-medium leading-[1.2] tracking-[-0.02em] text-white">
                Mairo combines strategy, creative, campaign management, analytics and
                optimisation into one AI-powered system.
              </h3>
              <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-white/70">
                One login. One bill. One thing to ask when you want to know how it is going.
                The advertising budget still goes to Meta and TikTok directly — Mairo decides
                how it gets used, and shows you every decision.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
