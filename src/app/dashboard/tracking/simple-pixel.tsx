"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkEventsAction, checkInstallationAction, quickSetupPixelAction } from "@/lib/actions/tracking-actions";
import { CopyField } from "@/components/copy-field";
import { Badge, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import type { CheckStatus } from "@/lib/tracking/state";
import type { SimplePixelView } from "@/lib/tracking/simple-view";

// The whole of tracking for somebody who doesn't know what a pixel is:
// one button, one line to paste, one check. Everything else on the page sits
// under Advanced for the people who want it.

export type { SimplePixelView };

const STATUS: Record<CheckStatus, { label: string; tone: "green" | "yellow" | "red" | "neutral" }> = {
  VERIFIED: { label: "Working", tone: "green" },
  NOT_DETECTED: { label: "Not found yet", tone: "yellow" },
  NOT_SEEN: { label: "Nothing yet", tone: "yellow" },
  MISSING_PERMISSION: { label: "Needs permission", tone: "yellow" },
  FAILED: { label: "Couldn't check", tone: "red" },
  UNAVAILABLE: { label: "Can't be checked here", tone: "neutral" },
};

type Result = { ok: true; message: string } | { ok: false; error: string };

/** advancedHref: where "change it under Advanced" goes — this page's section, or the Tracking page from elsewhere. */
export function SimplePixel({ view, advancedHref = "#advanced", heading = true }: { view: SimplePixelView; advancedHref?: string; heading?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [guide, setGuide] = useState(view.suggestedGuide);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      // The next step (the line to paste, the check's answer) comes from the server.
      router.refresh();
    });

  const installed = view.install?.status === "VERIFIED";
  const working = view.primaryEvent?.status === "VERIFIED";
  const steps = view.guides.find((g) => g.id === guide) ?? view.guides[view.guides.length - 1];
  const mail = view.snippet
    ? `mailto:?subject=${encodeURIComponent("Please add this line to our website")}&body=${encodeURIComponent(
        `Hi,\n\nCould you paste this one line inside the <head> of every page on our website? It's our advertising tracking (MAIRO / Meta pixel).\n\n${view.snippet}\n\nThanks!`,
      )}`
    : null;

  return (
    <section aria-labelledby={heading ? "simple-pixel-title" : undefined} className="space-y-6">
      {heading && (
        <div>
          <h2 id="simple-pixel-title" className="text-base font-medium text-white">
            Your pixel, in three steps
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-400">
            One line on your website lets Meta see who becomes a customer, so your ads can find more people like them. No other setup:
            MAIRO already knows what counts for your kind of business.
          </p>
        </div>
      )}

      {/* 1. The pixel */}
      <Step n={1} title="Set up your pixel" done={Boolean(view.pixel)}>
        {!view.connected ? (
          <p className="text-sm text-neutral-400">
            <Link href="/dashboard/meta" className="text-violet-bright underline underline-offset-4">Connect Meta</Link> first — the pixel lives in your ad account.
          </p>
        ) : view.pixel ? (
          <p className="text-sm text-neutral-300">
            Using <span className="text-white">{view.pixel.name}</span> <span className="text-neutral-500">({view.pixel.id})</span>.
          </p>
        ) : (
          <>
            <p className="text-sm text-neutral-400">MAIRO uses the pixel your ad account already has, or makes one if it has none.</p>
            <button type="button" className={`${primaryButtonClass} mt-3`} disabled={pending} onClick={() => run(quickSetupPixelAction)}>
              {pending ? "Setting up…" : "Set up my pixel"}
            </button>
          </>
        )}
      </Step>

      {/* 2. The line */}
      <Step n={2} title="Add one line to your website" done={installed} locked={!view.snippet}>
        {view.snippet && (
          <>
            <CopyField value={view.snippet} />
            <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Your website is built with">
              {view.guides.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={guide === g.id}
                  onClick={() => setGuide(g.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${guide === g.id ? "border-violet/60 bg-violet/15 text-white" : "border-white/12 text-neutral-300 hover:border-white/30"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-300">
              {steps.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <p className="mt-3 text-xs text-neutral-500">
              Someone else looks after your website?{" "}
              {mail && <a href={mail} className="text-violet-bright underline underline-offset-4">Email them the line</a>}. If your site already has Meta&rsquo;s pixel code, remove it so visits aren&rsquo;t counted twice.
            </p>
          </>
        )}
      </Step>

      {/* 3. The check */}
      <Step n={3} title="Check it's working" done={working} locked={!view.snippet}>
        {view.snippet && (
          <>
            <ul className="space-y-2 text-sm">
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-neutral-300">On your website</span>
                {view.install ? <Badge tone={STATUS[view.install.status].tone}>{STATUS[view.install.status].label}</Badge> : <Badge tone="neutral">Not checked</Badge>}
              </li>
              {view.primaryEvent && (
                <li className="flex flex-wrap items-center gap-2">
                  <span className="text-neutral-300">Meta received a {view.primaryEvent.name} in the last 7 days</span>
                  {view.primaryEvent.status ? <Badge tone={STATUS[view.primaryEvent.status].tone}>{STATUS[view.primaryEvent.status].label}</Badge> : <Badge tone="neutral">Not checked</Badge>}
                </li>
              )}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(checkInstallationAction)}>
                Check my website
              </button>
              {view.primaryEvent && (
                <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(checkEventsAction)}>
                  Check with Meta
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              To test it yourself, do what a customer would — {view.counts[0]?.label.toLowerCase() ?? "send an enquiry"} — then check with Meta. Events can take up to 20 minutes to show.
            </p>
          </>
        )}
      </Step>

      {view.counts.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">What it counts · {view.nicheLabel}</p>
          <ul className="mt-2 space-y-1 text-sm text-neutral-300">
            {view.counts.map((c) => (
              <li key={c.label}>
                {c.label} <span className="text-neutral-500">→ {c.event}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Wrong type of business? Change it under <a href={advancedHref} className="underline underline-offset-4">Advanced</a>.
          </p>
        </div>
      )}

      {note && (
        <p role="status" className={`text-sm ${note.ok ? "text-emerald-300" : "text-red-300"}`}>
          {note.text}
        </p>
      )}
    </section>
  );
}

function Step({ n, title, done, locked, children }: { n: number; title: string; done: boolean; locked?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-4 ${locked ? "opacity-50" : ""}`}>
      <span
        aria-hidden
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${done ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-white"}`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-white">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h3>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
