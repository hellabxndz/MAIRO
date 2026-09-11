import Link from "next/link";
import type { Readiness } from "@/lib/readiness";

// What MAIRO is waiting on, said plainly.
//
// The thing this replaces is a dashboard full of zeroes and a campaign sitting
// at "pending" with no explanation. A business owner looking at that concludes
// the product is broken, and they are not wrong to — nothing anywhere told
// them the ball was in their court.
//
// So it speaks in the first person, names the one thing that is next rather
// than presenting six equal chores, and is specific about the two that people
// get stuck on: the plan is not the ad spend, and MAIRO never pays Meta.

export function ReadinessPanel({
  readiness,
  autoLaunch,
  action,
}: {
  readiness: Readiness;
  autoLaunch: { held: boolean; waitingCount: number };
  /**
   * A one-click way out of the blocking step, where one exists.
   *
   * Today that is only Meta's payment settings — a deep link straight to the
   * page with the form on it. It lives here rather than in a second card
   * below, because two panels explaining the same missing card is one panel
   * too many.
   */
  action?: { url: string; label: string } | null;
}) {
  if (readiness.ready) return null;

  const next = readiness.next;

  return (
    // A section rather than a Card so the tour has something to point at.
    // This is the one thing on the dashboard a first-time customer needs to
    // read, so it is where the walkthrough stops.
    <section
      data-tour="checklist"
      className="mb-8 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-6"
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-[11px] font-medium text-amber-200">
          {readiness.remaining}
        </span>
        <div className="min-w-0">
          <h2 className="text-base text-white">
            Your ads can&rsquo;t run yet — {readiness.remaining} thing
            {readiness.remaining === 1 ? "" : "s"} left
          </h2>
          {next && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
              Next: <span className="text-white">{next.label.toLowerCase()}</span>. {next.detail}
            </p>
          )}
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-neutral-400">
            {autoLaunch.held
              ? "Once these are done MAIRO will build the campaign and wait for you, because you've asked it to hold before going live."
              : "Once these are done MAIRO writes the campaign, puts it in your ad account and switches it on for you. You don't have to come back and approve anything."}
          </p>
        </div>
      </div>

      <ol className="mt-6 space-y-2.5">
        {readiness.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] ${
                step.done
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : step.unknown
                    ? "border-neutral-600 text-neutral-500"
                    : "border-white/15 text-neutral-600"
              }`}
              aria-hidden
            >
              {step.done ? "✓" : step.unknown ? "?" : ""}
            </span>
            <div className="min-w-0">
              {step.done ? (
                <p className="text-sm text-neutral-500 line-through decoration-neutral-700">
                  {step.label}
                </p>
              ) : (
                <Link
                  href={step.href}
                  className="text-sm text-white underline decoration-white/20 underline-offset-4 transition hover:decoration-white"
                >
                  {step.label}
                </Link>
              )}
              {/* Only the blocking one is explained. Six paragraphs of
                  explanation is a wall nobody reads. */}
              {!step.done && step.id === next?.id && (
                <>
                  <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-neutral-500">
                    {step.unknown
                      ? "MAIRO couldn't check this with Meta just now — it will try again."
                      : step.detail}
                  </p>
                  {action && (
                    <a
                      href={action.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-[11px] font-medium text-black transition hover:bg-neutral-200"
                    >
                      {action.label} →
                    </a>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>

      <Link
        href="/dashboard/guide"
        className="mt-6 inline-block text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white"
      >
        How all of this works
      </Link>
    </section>
  );
}

/**
 * The version for a campaign that exists but is waiting.
 *
 * Narrower than the panel above and phrased around the campaign rather than
 * the account, because it appears next to the thing it is explaining.
 */
export function PendingReason({
  readiness,
  held,
  /** A booked start, already written out in the customer's own words. */
  startsAt = null,
}: {
  readiness: Readiness;
  held: boolean;
  startsAt?: string | null;
}) {
  // A campaign waiting on a date the customer chose is not a campaign waiting
  // on the customer, and saying "waiting on you" about their own booking would
  // read as MAIRO having lost track of what it was told.
  //
  // The date itself is deliberately not repeated here — the line immediately
  // below this one already carries it, along with the way to change it, and
  // printing it twice reads as a system that has lost track of what it said.
  if (readiness.ready && !held && startsAt) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-emerald-300/90">
        Everything&rsquo;s ready. This is just waiting for the time you picked.
      </p>
    );
  }

  if (readiness.ready && !held) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-emerald-300/90">
        Everything&rsquo;s done — MAIRO is switching this on. Refresh in a moment.
      </p>
    );
  }

  if (readiness.ready && held) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-amber-200/90">
        Ready to go live. MAIRO is holding it because you asked it to — switch that off in
        Settings and it will start.
      </p>
    );
  }

  const next = readiness.next;
  return (
    <p className="mt-3 max-w-2xl text-xs leading-relaxed text-amber-200/90">
      Waiting on you: <span className="font-medium">{next?.label.toLowerCase()}</span>.{" "}
      {next?.detail} MAIRO switches this on by itself once that&rsquo;s done.
    </p>
  );
}
