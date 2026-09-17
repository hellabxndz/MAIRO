// What MAIRO can and cannot promise.
//
// One component, two shapes, one wording. A disclaimer that is phrased three
// different ways in three places is worse than none: it reads as boilerplate
// somebody pasted, and if the three versions ever disagree, the weakest one is
// the one that counts against you.
//
// This is not decoration. MAIRO writes plans and campaigns for money, and
// advertising is the category where implied guarantees get regulators involved
// — the FTC and the CMA both treat "we'll grow your sales" as a substantiable
// claim, and the substantiation has to exist before the claim runs, not after.
// The honest version is also the more persuasive one: a product that tells you
// what it cannot do is believed about what it can.
//
// Placed wherever the product makes, or appears to make, a forward-looking
// statement: the landing hero, the pricing section, the footer, and both
// dashboards — the one place a paying customer reads a plan MAIRO wrote about
// a month that has not happened yet.

const SHORT =
  "MAIRO can't promise sales, leads or a particular return. It works from what you tell it " +
  "and what your ad account reports back, and does the best it can with both.";

const LONG =
  "MAIRO writes plans, creatives and campaigns from the information you give it and the " +
  "numbers your ad account reports back, and it does the best it can with both. It cannot " +
  "promise sales, leads or a particular return — those depend on your product, your pricing, " +
  "your market and what you spend. Any figures shown before a campaign has run are estimates, " +
  "not commitments.";

/**
 * One quiet line, for under a call to action or in a footer.
 *
 * Deliberately not hidden behind a tooltip or an asterisk. A disclosure that
 * takes an interaction to read is a disclosure designed not to be read, and
 * that is the version that fails when somebody asks whether it was clear.
 */
export function ResultsNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12px] leading-relaxed text-faint ${className}`}>{SHORT}</p>
  );
}

/**
 * The full statement, in a panel.
 *
 * For screens where MAIRO has just told somebody what to expect — a generated
 * plan, a pricing table — and the number beside it needs its context.
 */
export function ResultsDisclaimer({ className = "" }: { className?: string }) {
  return (
    <section
      className={`rounded-[var(--radius-panel)] border p-5 sm:p-6 ${className}`}
      style={{
        borderColor: "var(--mairo-line)",
        background: "rgba(10,16,32,0.5)",
      }}
      aria-labelledby="results-disclaimer-heading"
    >
      <h2
        id="results-disclaimer-heading"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint"
      >
        What MAIRO can and can&rsquo;t promise
      </h2>
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted">{LONG}</p>
    </section>
  );
}
