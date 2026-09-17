// A guide that knows where you actually are.
//
// A static list of instructions gets read once and ignored. This reads the
// database: each step is ticked because the thing genuinely happened, so it
// doubles as a status board — a freelancer glancing at it can see that three
// clients are set up and one still has no ad account connected.
//
// It disappears once the last step is done, because at that point they know
// how the product works and the screen is better without it.

export type GuideState = {
  hasClient: boolean;
  hasSetup: boolean;
  hasMeta: boolean;
  hasPlan: boolean;
  hasCampaign: boolean;
};

const STEPS: Array<{
  key: keyof GuideState;
  title: string;
  body: string;
}> = [
  {
    key: "hasClient",
    title: "Add a client business",
    body:
      "One row per business you run ads for. Everything after this happens inside a client, so this is the only step that starts up here.",
  },
  {
    key: "hasSetup",
    title: "Tell MAIRO about them",
    body:
      "What they sell, who buys it, what they want and what they can spend. This is the whole brief — the AI writes every plan and every ad from these answers, so it is worth five real minutes rather than one rushed one.",
  },
  {
    key: "hasMeta",
    title: "Connect their Meta ad account",
    body:
      "Open the client, go to Meta connection, and sign in as someone with access to their ad account. Each client connects separately — you are never moving budget between them by accident.",
  },
  {
    key: "hasPlan",
    title: "Generate the monthly plan",
    body:
      "The strategy, the budget split and what to expect. Read it before you show it to them; it is written to be forwarded to a client as-is.",
  },
  {
    key: "hasCampaign",
    title: "Approve, and let it build",
    body:
      "Campaigns are created in their ad account already paused. Nothing spends until somebody switches it on, so there is no way for this step to cost anyone money by surprise.",
  },
];

export function GettingStarted({ state }: { state: GuideState }) {
  const done = STEPS.filter((s) => state[s.key]).length;
  if (done === STEPS.length) return null;

  const nextIndex = STEPS.findIndex((s) => !state[s.key]);

  return (
    <section
      data-tour="checklist"
      className="mt-12 rounded-[var(--radius-panel)] border p-6 sm:p-8"
      style={{
        backgroundImage: "var(--mairo-glass)",
        borderColor: "var(--mairo-line)",
        boxShadow: "var(--mairo-glow-soft)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-white">How this works</h2>
        <div className="flex items-center gap-4">
          <a
            href="/clients/guide"
            className="text-[12px] text-muted underline decoration-[color:var(--mairo-line-lit)] underline-offset-2 transition-colors hover:text-white"
          >
            Read the full guide
          </a>
          <p className="text-[12px] text-faint">
            {done} of {STEPS.length} done
          </p>
        </div>
      </div>

      {/* Progress, as a single hairline. A bar with a percentage would be more
          emphasis than a five-step list deserves. */}
      <div className="mt-4 h-px w-full" style={{ background: "var(--mairo-line)" }}>
        <div
          className="h-px transition-all duration-700 [transition-timing-function:var(--ease-mairo)]"
          style={{ width: `${(done / STEPS.length) * 100}%`, backgroundImage: "var(--mairo-ramp)" }}
        />
      </div>

      <ol className="mt-8 space-y-6">
        {STEPS.map((step, i) => {
          const complete = state[step.key];
          const isNext = i === nextIndex;
          return (
            <li key={step.key} className="flex gap-4">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  complete
                    ? "border-live/35 bg-live/10 text-live"
                    : isNext
                      ? "border-[color:var(--mairo-line-lit)] text-white"
                      : "border-[color:var(--mairo-line)] text-faint"
                }`}
                style={isNext && !complete ? { boxShadow: "var(--mairo-glow-soft)" } : undefined}
              >
                {complete ? "\u2713" : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-[14px] ${complete ? "text-faint line-through" : "text-white"}`}>
                  {step.title}
                </p>
                {!complete && (
                  <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">
                    {step.body}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
