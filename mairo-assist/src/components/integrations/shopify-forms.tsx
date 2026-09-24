"use client";

import { RefreshCw, Store, Unplug } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { disconnectShopify, startShopifyConnect, syncShopifyNow } from "@/lib/shopify/actions";
import { type FormState, withNonce } from "@/lib/validation/form";

export function ConnectShopifyForm({ defaultShop, returnTo, label = "Connect Shopify" }: { defaultShop?: string; returnTo?: string; label?: string }) {
  const [state, action] = useActionState(withNonce(startShopifyConnect), {} as FormState);
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-3" noValidate>
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Store address" htmlFor="shop" hint="Your store's myshopify.com address — find it in Shopify admin under Settings → Domains." errors={state.errors?.shop}>
          <Input id="shop" name="shop" required placeholder="your-store.myshopify.com" autoComplete="off" spellCheck={false} defaultValue={state.values?.shop ?? defaultShop} />
        </Field>
        <SubmitButton pendingText="Opening Shopify…" className="sm:mb-[22px]">
          <Store aria-hidden /> {label}
        </SubmitButton>
      </div>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
    </form>
  );
}

export function SyncNowButton() {
  const [state, action] = useActionState(syncShopifyNow, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton variant="secondary" size="sm" pendingText="Starting…">
        <RefreshCw aria-hidden /> Sync now
      </SubmitButton>
      {state.message && <p className={state.ok ? "text-xs text-fg-muted" : "text-xs text-danger"} role="status">{state.message}</p>}
    </form>
  );
}

export function DisconnectShopifyButton({ shop }: { shop: string }) {
  const [state, action] = useActionState(disconnectShopify, {} as FormState);
  const [confirming, setConfirming] = useState(false);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <div className="space-y-2">
      {confirming ? (
        <form action={action} className="space-y-3 rounded-xl border border-danger/30 p-4">
          <p className="text-sm">
            Disconnect <strong>{shop}</strong>? Synced products, orders and customer details are deleted from Mairo Assist and your AI employee
            stops answering store questions. Conversations are kept.
          </p>
          <div className="flex gap-2">
            <SubmitButton variant="danger" size="sm" pendingText="Disconnecting…">Disconnect store</SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          <Unplug aria-hidden /> Disconnect
        </Button>
      )}
      {state.message && <p className="text-xs text-danger" role="alert">{state.message}</p>}
    </div>
  );
}
