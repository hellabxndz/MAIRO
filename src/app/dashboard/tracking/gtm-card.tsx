"use client";

import { useState, useTransition } from "react";
import { setGtmContainerAction, setNicheAction } from "@/lib/actions/tracking-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

// Tag Manager, as a one-import job.
//
// The thing being replaced here is an afternoon of work the customer cannot
// do: a base pixel on every page, a purchase tag on the confirmation page
// only, a click trigger on the phone number, a form trigger, and each of them
// pointed at the right standard event for their kind of business. GTM's
// Import Container does all of it from one file, so MAIRO writes the file.
//
// The niche picker is the part that makes it worth doing at all. "Track
// Purchase" is wrong advice for a plumber — there is no checkout and never
// will be — and a container that fires nothing is worse than no container,
// because it looks installed.

type Action = {
  id: string;
  label: string;
  why: string;
  metaEvent: string;
  tiktokEvent: string;
  hasValue: boolean;
  primary: boolean;
  detection: string;
  match: string | null;
};

type NicheOption = { id: string; label: string };

const DETECTION_COPY: Record<string, string> = {
  url_contains: "when they reach",
  form_submit: "when any form is sent",
  phone_click: "when they tap your phone number",
  email_click: "when they tap your email",
  click_selector: "when they click",
  datalayer_event: "when your shop reports it",
};

export function GtmCard({
  niches,
  currentNicheId,
  nicheConfirmed,
  nicheSummary,
  actions,
  gtmContainerId,
  hasAnyPixel,
  dataLayer,
  gtmSnippetForContainer,
}: {
  niches: NicheOption[];
  currentNicheId: string;
  nicheConfirmed: boolean;
  nicheSummary: string;
  actions: Action[];
  gtmContainerId: string | null;
  hasAnyPixel: boolean;
  dataLayer: string | null;
  gtmSnippetForContainer: string | null;
}) {
  const [niche, setNiche] = useState(currentNicheId);
  const [container, setContainer] = useState(gtmContainerId ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean } & ({ message: string } | { error: string })>) {
    setResult(null);
    start(async () => {
      const res = await fn();
      setResult({ ok: res.ok, message: "message" in res ? res.message : res.error });
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-neutral-400" htmlFor="niche">
            What kind of business is this?
          </label>
          {!nicheConfirmed && (
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              MAIRO&rsquo;s guess
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            id="niche"
            value={niche}
            onChange={(e) => {
              setNiche(e.target.value);
              run(() => setNicheAction(e.target.value));
            }}
            className={`${inputClass} max-w-xs`}
          >
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-neutral-500">{nicheSummary}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-neutral-300">
          What MAIRO will count as a conversion
        </p>
        <div className="mt-3 space-y-2.5">
          {actions.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="text-sm text-white">{a.label}</p>
                {a.primary && (
                  <span className="rounded-full border border-emerald-400/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-emerald-300">
                    Optimise for this
                  </span>
                )}
                {a.hasValue && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-neutral-500">
                    Carries a value
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">{a.why}</p>
              <p className="mt-1.5 text-[11px] text-neutral-600">
                Fires {DETECTION_COPY[a.detection] ?? "when it happens"}
                {a.match ? ` ${a.match}` : ""} · Meta {a.metaEvent} · TikTok {a.tiktokEvent}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="gtm-id">
            Your Tag Manager container
          </label>
          <input
            id="gtm-id"
            value={container}
            onChange={(e) => setContainer(e.target.value)}
            className={inputClass}
            placeholder="GTM-ABC1234"
          />
        </div>
        <button
          type="button"
          onClick={() => run(() => setGtmContainerAction(container))}
          disabled={busy}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white transition hover:border-white/30 disabled:opacity-50"
        >
          Save
        </button>
        <a
          href="https://tagmanager.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="pb-2 text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white"
        >
          Don&rsquo;t have one? Make one free
        </a>
      </div>

      {result && (
        <p className={`text-xs ${result.ok ? "text-emerald-300" : "text-red-400"}`}>
          {result.message}
        </p>
      )}

      {gtmSnippetForContainer && (
        <Snippet
          title="1. Put Tag Manager on your site"
          hint="Once, on every page. Most shop builders have a box for this in the theme or the header settings."
          code={gtmSnippetForContainer}
        />
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-white">
          {gtmSnippetForContainer ? "2." : "1."} Import MAIRO&rsquo;s tags
        </p>
        <ol className="mt-3 space-y-2">
          {[
            "Download the file below.",
            "In Tag Manager: Admin → Import Container.",
            "Choose the file, pick your workspace, and choose Merge (not Overwrite).",
            "Preview if you like, then Submit and Publish.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-xs leading-relaxed text-neutral-400">
              <span className="flex-none text-neutral-600">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {hasAnyPixel ? (
          <a
            href="/api/tracking/gtm-container"
            className={`${primaryButtonClass} mt-4`}
            download
          >
            Download my container file
          </a>
        ) : (
          <p className="mt-4 text-xs text-amber-200/90">
            Set up a pixel above first — a container with no pixel in it imports cleanly and
            measures nothing, which is the worst of both.
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Merge rather than Overwrite matters: Overwrite deletes every tag you already
          have. MAIRO&rsquo;s tags are all named &ldquo;MAIRO&nbsp;-&nbsp;…&rdquo; so you can
          always see which are which.
        </p>
      </div>

      {dataLayer && (
        <Snippet
          title="3. Tell it what the order was worth"
          hint="Only needed for the conversions that carry money. Without it they still fire — they just report no value, so ROAS stays blank."
          code={dataLayer}
        />
      )}
    </div>
  );
}

function Snippet({ title, hint, code }: { title: string; hint: string; code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-white">{title}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(code)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => setCopied(false));
          }}
          className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-neutral-400 transition hover:border-white/30 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">{hint}</p>
      <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-neutral-400">
        <code>{code}</code>
      </pre>
    </div>
  );
}
