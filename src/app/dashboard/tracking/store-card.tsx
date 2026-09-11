"use client";

import { useState, useTransition } from "react";
import {
  recordManualOrderAction,
  rotateIngestTokenAction,
  saveShopifySecretAction,
} from "@/lib/actions/tracking-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

// Connecting the shop, so MAIRO knows what was actually sold.
//
// This is the half that a pixel alone cannot do. The pixel reports what
// survived the browser; the shop knows what was bought. Sending the shop's
// orders here recovers the conversions the browser lost, and gives the
// dashboard a revenue figure that does not depend on anybody's tracking
// working perfectly.

type Props = {
  ingestUrl: string;
  hasShopifySecret: boolean;
  lastReceivedAt: string | null;
  receivedCount: number;
};

const STORES = [
  {
    id: "shopify",
    name: "Shopify",
    steps: [
      "In Shopify: Settings → Notifications → Webhooks → Create webhook.",
      "Event: Order creation. Format: JSON.",
      "Paste the link above as the URL and save.",
      "Shopify shows a signing secret on that page — paste it below so MAIRO can verify every order really came from your shop.",
    ],
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    steps: [
      "In WordPress: WooCommerce → Settings → Advanced → Webhooks → Add webhook.",
      "Topic: Order created. Delivery URL: the link above.",
      "Set status to Active and save.",
    ],
  },
  {
    id: "other",
    name: "Something else",
    steps: [
      "POST to the link above whenever an order completes, with JSON like:",
      '{ "order_id": "1234", "value": 49.99, "currency": "USD", "email": "buyer@example.com" }',
      "Only order_id and value are required. Sending the email roughly doubles how many sales the networks can match to an ad.",
    ],
  },
] as const;

export function StoreCard({ ingestUrl, hasShopifySecret, lastReceivedAt, receivedCount }: Props) {
  const [store, setStore] = useState<(typeof STORES)[number]["id"]>("shopify");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();

  const active = STORES.find((s) => s.id === store)!;

  function run(fn: () => Promise<{ ok: boolean } & ({ message: string } | { error: string })>) {
    setResult(null);
    start(async () => {
      const res = await fn();
      setResult({ ok: res.ok, message: "message" in res ? res.message : res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-neutral-300">Your shop&rsquo;s link</p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(ingestUrl)
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
        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-neutral-400">
          <code>{ingestUrl}</code>
        </pre>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          Treat it like a password — anyone with it can add orders to your reporting.{" "}
          <button
            type="button"
            onClick={() => run(rotateIngestTokenAction)}
            disabled={busy}
            className="underline underline-offset-4 transition hover:text-white disabled:opacity-50"
          >
            Make a new one
          </button>{" "}
          if it gets out.
        </p>
        {receivedCount > 0 && (
          <p className="mt-1.5 text-xs text-emerald-300/80">
            {receivedCount.toLocaleString()} order{receivedCount === 1 ? "" : "s"} received
            {lastReceivedAt ? `, last one ${new Date(lastReceivedAt).toLocaleString()}` : ""}.
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          {STORES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStore(s.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                store === s.id
                  ? "border-white/40 bg-white/[0.07] text-white"
                  : "border-white/10 text-neutral-400 hover:border-white/25"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <ol className="mt-4 space-y-2">
          {active.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-xs leading-relaxed text-neutral-400">
              <span className="flex-none text-neutral-600">{i + 1}.</span>
              <span className={step.startsWith("{") ? "font-mono text-neutral-500" : ""}>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {store === "shopify" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1 space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="shopify-secret">
              Shopify signing secret {hasShopifySecret && <span className="text-emerald-400">· saved</span>}
            </label>
            <input
              id="shopify-secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={inputClass}
              placeholder={hasShopifySecret ? "••••••••••••" : "From Shopify's webhook page"}
            />
          </div>
          <button
            type="button"
            onClick={() => run(() => saveShopifySecretAction(secret))}
            disabled={busy}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white transition hover:border-white/30 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {result && (
        <p className={`text-xs ${result.ok ? "text-emerald-300" : "text-red-400"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}

/**
 * For a business whose orders don't happen on a website.
 *
 * A plumber quoting over the phone has no checkout for a pixel to watch, and
 * would otherwise never see a ROAS at all. Meta and TikTok both accept these
 * exactly like any other conversion.
 */
export function ManualOrderForm({ currency }: { currency: string }) {
  const [orderId, setOrderId] = useState("");
  const [value, setValue] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();

  const ready = orderId.trim().length > 0 && value.trim().length > 0;

  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <p className="text-sm text-white">Took an order off the internet?</p>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500">
        A phone call, a walk-in, an invoice. Add it here and it counts towards your ROAS the
        same as an online sale — and tells the ad networks their ads are working.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="mo-ref">
            Reference
          </label>
          <input
            id="mo-ref"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className={inputClass}
            placeholder="Invoice 1042"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="mo-value">
            Worth ({currency})
          </label>
          <input
            id="mo-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
            placeholder="450"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="mo-email">
            Their email (optional)
          </label>
          <input
            id="mo-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="Helps match it to the ad"
          />
        </div>
      </div>

      {result && (
        <p className={`mt-3 text-xs ${result.ok ? "text-emerald-300" : "text-red-400"}`}>
          {result.message}
        </p>
      )}

      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => {
          setResult(null);
          start(async () => {
            const res = await recordManualOrderAction({
              orderId: orderId.trim(),
              value,
              currency,
              email: email.trim() || null,
            });
            setResult({ ok: res.ok, message: res.ok ? res.message : res.error });
            if (res.ok) {
              setOrderId("");
              setValue("");
              setEmail("");
            }
          });
        }}
        className={`${primaryButtonClass} mt-4`}
      >
        {busy ? "Adding…" : "Add this sale"}
      </button>
    </div>
  );
}
