import { Card, PageHeader, Badge } from "@/components/ui";
import { CopyField } from "@/components/copy-field";
import { metaRedirectUri } from "@/lib/meta/oauth";
import { checkPrices, type PriceCheck } from "@/lib/stripe/price-check";
import { stripeMode } from "@/lib/stripe/client";

// Owner-only configuration check. This exists because the failure mode when a
// credential is missing or a redirect URI is a character off is an opaque
// error from Facebook, hours after the fact, on someone else's signup.
//
// It reports only whether each value is PRESENT, never the value itself —
// this page must stay safe to screenshot.

export const dynamic = "force-dynamic";

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

const CHECKS: { name: string; label: string; why: string }[] = [
  {
    name: "META_APP_ID",
    label: "Meta App ID",
    why: "Identifies your app to Facebook when a customer connects. Public value.",
  },
  {
    name: "META_APP_SECRET",
    label: "Meta App Secret",
    why: "Exchanges the login code for an access token. Secret — never shown here.",
  },
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic API key",
    why: "Powers the AI agents and the monthly plan builder.",
  },
  {
    name: "DATABASE_URL",
    label: "Database",
    why: "Postgres connection. Already working if you can read this page.",
  },
  {
    name: "STRIPE_SECRET_KEY",
    label: "Stripe secret key",
    why: "Takes subscription payments. Without it the plan buttons are inert.",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    label: "Stripe webhook secret",
    why:
      "Proves an incoming webhook really came from Stripe. Without it every " +
      "delivery is refused, and a subscription would be paid for but never applied.",
  },
  {
    name: "TOKEN_ENCRYPTION_KEY",
    label: "Token encryption key",
    why:
      "Encrypts the Meta access tokens at rest. Without it they are stored in plain " +
      "text, and anyone who obtained a copy of the database could spend your clients' " +
      "ad budgets. Generate with: openssl rand -base64 32",
  },
];

export default async function SetupPage() {
  let redirectUri: string | null = null;
  let redirectError: string | null = null;
  try {
    redirectUri = metaRedirectUri();
  } catch (error) {
    redirectError = error instanceof Error ? error.message : "Could not determine redirect URI";
  }

  const results = CHECKS.map((c) => ({ ...c, ok: present(c.name) }));
  const missing = results.filter((r) => !r.ok);

  // What Stripe would actually charge, next to what the site advertises. This
  // is the one mismatch nothing else in the app can catch, and its symptom is
  // a customer's card statement.
  const prices = await checkPrices();
  const priceProblems = prices.filter((p) => p.state !== "ok" && p.state !== "not_set");

  return (
    <div>
      <PageHeader
        title="Setup check"
        description="What this deployment is configured with, and the exact values to paste into Meta."
      />

      <Card className="mb-6">
        <h2 className="text-sm font-medium text-white">Meta OAuth redirect URI</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Paste this into your Meta app under{" "}
          <span className="text-neutral-200">Facebook Login → Settings → Valid OAuth Redirect URIs</span>{" "}
          and save. Facebook compares it character for character — copy it, don&apos;t retype it.
        </p>
        <div className="mt-4">
          {redirectUri ? (
            <CopyField value={redirectUri} />
          ) : (
            <p className="text-sm text-red-300">{redirectError}</p>
          )}
        </div>
      </Card>

      <Card className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-white">What Stripe actually charges</h2>
          <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            {stripeMode()} mode
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
          The price on the pricing page and the price Stripe takes are set in two different
          places. Nothing breaks when they disagree — the site just advertises one number and
          charges another, and the first anyone notices is a card statement. This reads each
          price back out of Stripe and compares it.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {prices.map((p) => (
            <PriceRow key={p.tier} check={p} />
          ))}
        </div>

        {priceProblems.length > 0 && (
          <p className="mt-6 border-t border-white/10 pt-4 text-sm leading-relaxed text-amber-300">
            {priceProblems.length} price
            {priceProblems.length === 1 ? "" : "s"} {priceProblems.length === 1 ? "does" : "do"} not
            match the pricing page. In Stripe: Product catalogue → the product → Add another
            price → recurring, monthly, the amount shown above → copy the{" "}
            <code className="text-amber-200">price_…</code> id into the matching variable in
            Vercel, then redeploy. Don&apos;t edit the old price — Stripe amounts are immutable,
            and archiving one that still has subscribers on it breaks their renewals.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-white">Environment</h2>
        <div className="mt-4 flex flex-col gap-4">
          {results.map((r) => (
            <div
              key={r.name}
              className="flex flex-col gap-2 border-t border-white/10 pt-4 first:border-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="max-w-lg">
                <div className="flex items-center gap-3">
                  <Badge tone={r.ok ? "green" : "red"}>{r.ok ? "SET" : "MISSING"}</Badge>
                  <span className="text-sm text-white">{r.label}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">{r.why}</p>
              </div>
              <code className="text-xs text-neutral-600">{r.name}</code>
            </div>
          ))}
        </div>

        {missing.length > 0 && (
          <p className="mt-6 border-t border-white/10 pt-4 text-sm leading-relaxed text-amber-300">
            {missing.length} value{missing.length === 1 ? "" : "s"} still missing. Add{" "}
            {missing.map((m) => m.name).join(", ")} in Vercel under Settings → Environment
            Variables, then redeploy — environment changes only apply to a new build.
          </p>
        )}
      </Card>
    </div>
  );
}

const PRICE_TONE: Record<PriceCheck["state"], "green" | "red" | "yellow" | "neutral"> = {
  ok: "green",
  // Not set is not a fault — the freelancer tiers are deliberately unsold
  // until their prices exist, and purchasableTiers() already hides them.
  not_set: "neutral",
  amount_mismatch: "red",
  wrong_interval: "red",
  not_found: "red",
  unreadable: "yellow",
};

const PRICE_LABEL: Record<PriceCheck["state"], string> = {
  ok: "MATCHES",
  not_set: "NOT SOLD",
  amount_mismatch: "WRONG PRICE",
  wrong_interval: "WRONG INTERVAL",
  not_found: "NO SUCH PRICE",
  unreadable: "UNREADABLE",
};

function dollars(cents: number, currency: string | null): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: (currency ?? "usd").toUpperCase(),
  });
}

function PriceRow({ check }: { check: PriceCheck }) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4 first:border-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-lg">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={PRICE_TONE[check.state]}>{PRICE_LABEL[check.state]}</Badge>
          <span className="text-sm text-white">{check.planName}</span>
          <span className="text-xs tabular-nums text-neutral-400">
            page {dollars(check.advertisedCents, check.currency)}
            {check.stripeCents !== null && check.stripeCents !== check.advertisedCents && (
              <span className="text-red-300">
                {" · "}Stripe {dollars(check.stripeCents, check.currency)}
              </span>
            )}
          </span>
        </div>
        {check.detail && (
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">{check.detail}</p>
        )}
      </div>
      <code className="text-xs text-neutral-600">{check.envName}</code>
    </div>
  );
}
