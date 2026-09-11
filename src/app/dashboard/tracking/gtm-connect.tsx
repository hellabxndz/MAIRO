"use client";

import { useState, useTransition } from "react";
import {
  chooseGtmContainerAction,
  disconnectGtmAction,
  listGtmContainersAction,
  provisionGtmAction,
  type ContainerChoice,
} from "@/lib/actions/tracking-actions";
import { Badge, primaryButtonClass } from "@/components/ui";

// The automatic path: MAIRO writes the tags into their container itself.
//
// Sits above the download, because for anyone who has Tag Manager it is
// strictly better — no file, no import screen, no chance of picking Overwrite
// and deleting their existing tags. The download stays for everyone else, and
// because a customer whose IT policy forbids granting API access to a SaaS is
// a real customer with a real reason.
//
// The two states this is careful about are the ones that look like success.
// Connected without publish permission means the tags get created and change
// nothing; a container not yet chosen means the button would have nowhere to
// write. Both are said plainly rather than left for the customer to discover
// from an empty conversion column weeks later.

type Summary = {
  connected: boolean;
  googleEmail: string | null;
  containerPublic: string | null;
  containerName: string | null;
  canPublish: boolean;
  lastPublishedAt: string | null;
  publishedTagCount: number | null;
  problem: string | null;
};

export function GtmConnect({
  configured,
  summary,
  hasAnyPixel,
}: {
  configured: boolean;
  summary: Summary;
  hasAnyPixel: boolean;
}) {
  const [containers, setContainers] = useState<ContainerChoice[] | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean } & ({ message: string } | { error: string })>) {
    setResult(null);
    start(async () => {
      const res = await fn();
      setResult({ ok: res.ok, message: "message" in res ? res.message : res.error });
    });
  }

  function loadContainers() {
    setResult(null);
    start(async () => {
      const res = await listGtmContainersAction();
      if (res.ok) {
        setContainers(res.containers);
        if (res.containers.length === 0) {
          setResult({
            ok: false,
            message:
              "That Google account doesn't administer any web containers. Make one free in Tag Manager, then try again.",
          });
        }
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-white">Let MAIRO install the tags for you</p>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-neutral-500">
          Not switched on for this deployment yet — it needs a Google Cloud OAuth client.
          The download below does the same job in one extra step.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-sm text-white">Let MAIRO install the tags for you</p>
            {summary.connected && (
              <Badge tone={summary.canPublish ? "green" : "yellow"}>
                {summary.canPublish ? "Connected" : "Can't publish"}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-neutral-400">
            Connect Google and MAIRO writes the tags straight into your Tag Manager and
            publishes them. No file, no import screen.
          </p>
          {summary.googleEmail && (
            <p className="mt-1.5 text-xs text-neutral-500">{summary.googleEmail}</p>
          )}
          {summary.containerPublic && (
            <p className="mt-0.5 text-xs text-neutral-500">
              Writing to {summary.containerPublic}
              {summary.containerName ? ` — ${summary.containerName}` : ""}
            </p>
          )}
          {summary.lastPublishedAt && (
            <p className="mt-0.5 text-xs text-emerald-300/80">
              {summary.publishedTagCount ?? 0} tags published{" "}
              {new Date(summary.lastPublishedAt).toLocaleString()}
            </p>
          )}
          {summary.problem && (
            <p className="mt-1.5 max-w-xl text-xs text-amber-200/80">{summary.problem}</p>
          )}
        </div>

        <a
          href="/api/gtm/connect"
          className={
            summary.connected
              ? "rounded-full border border-white/15 px-4 py-2 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white"
              : "rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition hover:bg-neutral-200"
          }
        >
          {summary.connected ? "Reconnect" : "Connect Google"}
        </a>
      </div>

      {summary.connected && !summary.canPublish && (
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-amber-200/90">
          MAIRO can create the tags but not publish them, so they would sit in a workspace
          doing nothing. Reconnect and tick every permission, or press Submit yourself in Tag
          Manager afterwards.
        </p>
      )}

      {summary.connected && (
        <div className="mt-4 space-y-3">
          {!summary.containerPublic && containers === null && (
            <button
              type="button"
              onClick={loadContainers}
              disabled={busy}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white transition hover:border-white/30 disabled:opacity-50"
            >
              {busy ? "Looking…" : "Choose a container"}
            </button>
          )}

          {containers !== null && containers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-300">
                Which container should MAIRO write to?
              </p>
              <div className="mt-2 space-y-2">
                {containers.map((c) => (
                  <button
                    key={`${c.accountId}-${c.containerId}`}
                    type="button"
                    onClick={() =>
                      run(async () => {
                        const res = await chooseGtmContainerAction(c);
                        if (res.ok) setContainers(null);
                        return res;
                      })
                    }
                    disabled={busy}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-left transition hover:border-white/30 disabled:opacity-50"
                  >
                    <span className="text-sm text-white">{c.name}</span>
                    <span className="font-mono text-xs text-neutral-500">
                      {c.publicId} · {c.accountName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {summary.containerPublic && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => run(provisionGtmAction)}
                disabled={busy || !hasAnyPixel}
                className={primaryButtonClass}
              >
                {busy
                  ? "Installing…"
                  : summary.lastPublishedAt
                    ? "Update my tags"
                    : "Install and publish my tags"}
              </button>
              <button
                type="button"
                onClick={loadContainers}
                disabled={busy}
                className="text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white disabled:opacity-50"
              >
                Use a different container
              </button>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    const res = await disconnectGtmAction();
                    if (res.ok) setContainers(null);
                    return res;
                  })
                }
                disabled={busy}
                className="text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          )}

          {!hasAnyPixel && summary.containerPublic && (
            <p className="text-xs text-amber-200/90">
              Set up a pixel above first — there would be nothing for the tags to fire.
            </p>
          )}

          {summary.containerPublic && (
            <p className="max-w-2xl text-xs leading-relaxed text-neutral-500">
              MAIRO writes into its own workspace called &ldquo;MAIRO&rdquo; and only ever
              touches tags named &ldquo;MAIRO&nbsp;-&nbsp;…&rdquo;. Running it again replaces
              those rather than adding a second copy, so your sales never get counted twice.
            </p>
          )}
        </div>
      )}

      {result && (
        <p className={`mt-3 text-xs ${result.ok ? "text-emerald-300" : "text-red-400"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
