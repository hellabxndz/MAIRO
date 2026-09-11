"use client";

import { useState, useTransition } from "react";
import {
  adoptPixelAction,
  checkPixelAction,
  setUpPixelAction,
} from "@/lib/actions/tracking-actions";
import { Badge, inputClass, primaryButtonClass } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icons";
import type { AdPlatform } from "@/generated/prisma/enums";

// One network's pixel: create it, prove it works, and hand over the code.
//
// The status here is the part that earns its place. "Created" is not a state
// worth celebrating — it takes one API call and means nothing on its own. The
// only question a business owner has is whether their sales are being counted,
// and the answer comes from the network's own record of when it last saw an
// event, not from MAIRO's record of having created something.

type Snapshot = {
  platform: AdPlatform;
  pixelId: string;
  status: "PENDING" | "ACTIVE" | "NO_EVENTS" | "ERROR";
  lastFiredAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  baseSnippet: string;
  purchaseSnippet: string;
};

const STATUS: Record<
  Snapshot["status"],
  { label: string; tone: "green" | "yellow" | "red" | "neutral"; detail: string }
> = {
  ACTIVE: {
    label: "Counting sales",
    tone: "green",
    detail: "The network is receiving events from your site. Your ROAS is real.",
  },
  NO_EVENTS: {
    label: "Not seeing anything",
    tone: "yellow",
    detail:
      "The pixel exists but nothing has reached it. Until it does, every ROAS figure is blank — the network has no idea anybody bought.",
  },
  PENDING: {
    label: "Needs installing",
    tone: "neutral",
    detail: "Put the code below on your website, then check again.",
  },
  ERROR: {
    label: "Couldn't check",
    tone: "red",
    detail: "MAIRO couldn't ask the network about this pixel just now.",
  },
};

export function PixelCard({
  platform,
  name,
  snapshot,
  allowed,
  upgradeName,
  connected,
}: {
  platform: AdPlatform;
  name: string;
  snapshot: Snapshot | null;
  allowed: boolean;
  upgradeName: string;
  connected: boolean;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [manualId, setManualId] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [busy, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean } & ({ message: string } | { error: string })>) {
    setResult(null);
    start(async () => {
      const res = await fn();
      setResult({
        ok: res.ok,
        message: "message" in res ? res.message : res.error,
      });
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-300">
            <PlatformIcon platform={platform} className="h-4 w-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-sm text-white">{name}</h3>
              {snapshot && (
                <Badge tone={STATUS[snapshot.status].tone}>
                  {STATUS[snapshot.status].label}
                </Badge>
              )}
            </div>
            {snapshot ? (
              <>
                <p className="mt-1 font-mono text-xs text-neutral-500">{snapshot.pixelId}</p>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-neutral-400">
                  {STATUS[snapshot.status].detail}
                </p>
                {snapshot.lastFiredAt && (
                  <p className="mt-1 text-xs text-neutral-600">
                    Last event {new Date(snapshot.lastFiredAt).toLocaleString()}
                  </p>
                )}
                {snapshot.lastError && (
                  <p className="mt-1.5 text-xs text-amber-200/80">{snapshot.lastError}</p>
                )}
              </>
            ) : (
              <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-neutral-400">
                No pixel yet, so {name} has no way of knowing when someone buys — which is why
                your ROAS is blank.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!allowed ? (
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3.5 py-1.5 text-xs text-sky-200">
              Included in {upgradeName}
            </span>
          ) : !connected ? (
            <span className="text-xs text-neutral-500">Connect {name} first</span>
          ) : snapshot ? (
            <button
              type="button"
              onClick={() => run(() => checkPixelAction(platform))}
              disabled={busy}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-50"
            >
              {busy ? "Checking…" : "Check it's working"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run(() => setUpPixelAction(platform))}
              disabled={busy}
              className={primaryButtonClass}
            >
              {busy ? "Setting up…" : "Set up tracking"}
            </button>
          )}
        </div>
      </div>

      {result && (
        <p className={`mt-3 text-xs ${result.ok ? "text-emerald-300" : "text-red-400"}`}>
          {result.message}
        </p>
      )}

      {snapshot && (
        <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
          <Snippet
            title="1. On every page of your site"
            hint="Paste this just before the closing </head> tag. On Shopify, Wix or Squarespace there's a box for it in the theme settings — no code editing."
            code={snapshot.baseSnippet}
          />
          <Snippet
            title="2. On the order-confirmation page only"
            hint="This is the one that makes ROAS work — it tells the network what the order was worth. Replace the capitalised words with your shop's own variables."
            code={snapshot.purchaseSnippet}
          />
        </div>
      )}

      {allowed && connected && !snapshot && (
        <div className="mt-4">
          {showManual ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-neutral-400" htmlFor={`pid-${platform}`}>
                  Already have a pixel? Its id
                </label>
                <input
                  id={`pid-${platform}`}
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  className={inputClass}
                  placeholder="1234567890"
                />
              </div>
              <button
                type="button"
                onClick={() => run(() => adoptPixelAction(platform, manualId))}
                disabled={busy || manualId.trim().length === 0}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white transition hover:border-white/30 disabled:opacity-50"
              >
                Use it
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white"
            >
              I already have a pixel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Snippet({ title, hint, code }: { title: string; hint: string; code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-300">{title}</p>
        <button
          type="button"
          onClick={() => {
            // Clipboard access can be refused outright — an insecure origin,
            // or a browser that has not granted it. Saying nothing happened is
            // better than a "Copied!" that didn't.
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
