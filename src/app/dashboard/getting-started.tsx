// Where a business owner is up to, read from their account.
//
// The same idea as the freelancer checklist, but the steps are the ones that
// actually block a first ad going live, in the order they block it. It removes
// itself once the last one is done — at that point the dashboard has real
// numbers on it and this would just be in the way.

export type OwnerGuideState = {
  hasSetup: boolean;
  hasMeta: boolean;
  hasPlan: boolean;
  hasCreative: boolean;
  hasCampaign: boolean;
};

const STEPS: Array<{ key: keyof OwnerGuideState; title: string; body: string; href?: string }> = [
  {
    key: "hasSetup",
    title: "Tell MAIRO about your business",
    body:
      "What you sell, who buys it, and what you want out of advertising. Every plan and every ad gets written from these answers, so it is worth answering properly.",
    href: "/dashboard/settings",
  },
  {
    key: "hasMeta",
    title: "Connect your ad account",
    body:
      "Sign in with the Facebook account that manages your business's ads. Nothing can go live until this is done — and MAIRO can only ever touch the account you connect.",
    href: "/dashboard/meta",
  },
  {
    key: "hasPlan",
    title: "Read this month's plan",
    body:
      "What to spend, where, and what to expect. Ten minutes here and the rest of the product makes sense.",
    href: "/dashboard/plan",
  },
  {
    key: "hasCreative",
    title: "Make your first ad",
    body:
      "Send a photo of what you sell. You get the picture, the headline and the words back — and rewrites are free, so push it until you would be happy to see it on your own feed.",
    href: "/dashboard/creatives",
  },
  {
    key: "hasCampaign",
    title: "Approve it",
    body:
      "MAIRO builds the campaign in your ad account, paused. You turn it on when you are ready — nothing spends before that.",
    href: "/dashboard/campaigns",
  },
];

export function OwnerGettingStarted({ state }: { state: OwnerGuideState }) {
  const done = STEPS.filter((s) => state[s.key]).length;
  if (done === STEPS.length) return null;

  const nextIndex = STEPS.findIndex((s) => !state[s.key]);

  return (
    <section
      data-tour="checklist"
      className="mb-8 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Getting your first ad live</h2>
        <div className="flex items-center gap-4">
          <a
            href="/dashboard/guide"
            className="text-xs text-neutral-400 underline transition hover:text-white"
          >
            How it all works
          </a>
          <p className="text-xs text-neutral-500">
            {done} of {STEPS.length}
          </p>
        </div>
      </div>

      <div className="mt-4 h-px w-full bg-white/10">
        <div
          className="h-px bg-white/60 transition-all duration-700"
          style={{ width: `${(done / STEPS.length) * 100}%` }}
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
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : isNext
                      ? "border-white/40 text-white"
                      : "border-white/10 text-neutral-600"
                }`}
              >
                {complete ? "✓" : i + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm ${
                    complete ? "text-neutral-500 line-through decoration-neutral-700" : "text-white"
                  }`}
                >
                  {step.title}
                </p>
                {!complete && (
                  <>
                    <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-neutral-500">
                      {step.body}
                    </p>
                    {isNext && step.href && (
                      <a
                        href={step.href}
                        className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-[11px] font-medium text-black transition hover:bg-neutral-200"
                      >
                        {step.title}
                      </a>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
