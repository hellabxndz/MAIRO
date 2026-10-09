// Every copy of the site's address an outside service keeps.
//
// MAIRO lives on one address (NEXT_PUBLIC_APP_URL, e.g. https://mairo.io; see
// canonical-host.ts for the redirect to it). Meta's redirect list, Google's,
// Stripe's webhook endpoint and the policy links Meta reviews each hold their
// own copy, and each has to be updated by hand when the address changes. The
// setup page lists them all, ready to paste.

import { META_CALLBACK_PATH } from "@/lib/meta/oauth";
import { GTM_CALLBACK_PATH } from "@/lib/tracking/gtm-api/oauth";

export type RegisteredAddress = { key: string; label: string; where: string; value: string };

/** Every copy of the site's address an outside service keeps, for the given origin. */
export function addressesToRegister(origin: string): RegisteredAddress[] {
  const base = origin.replace(/\/+$/, "");
  const host = new URL(base).host;
  return [
    { key: "meta-redirect", label: "Facebook login return address", where: "Meta app → Facebook Login → Settings → Valid OAuth Redirect URIs", value: `${base}${META_CALLBACK_PATH}` },
    { key: "meta-domain", label: "App domain", where: "Meta app → App settings → Basic → App domains", value: host },
    { key: "privacy", label: "Privacy policy", where: "Meta app → App settings → Basic → Privacy policy URL; Google consent screen", value: `${base}/privacy` },
    { key: "terms", label: "Terms of service", where: "Meta app → App settings → Basic → Terms of Service URL; Google consent screen", value: `${base}/terms` },
    { key: "data-deletion", label: "Data deletion instructions", where: "Meta app → App settings → Basic → User data deletion", value: `${base}/data-deletion` },
    { key: "google-signin", label: "Google sign-in return address", where: "Google Cloud → Credentials → the OAuth client → Authorized redirect URIs", value: `${base}/api/auth/callback/google` },
    { key: "gtm", label: "Google Tag Manager return address", where: "Google Cloud → Credentials → the OAuth client → Authorized redirect URIs", value: `${base}${GTM_CALLBACK_PATH}` },
    { key: "google-origin", label: "Google sign-in origin", where: "Google Cloud → Credentials → the OAuth client → Authorized JavaScript origins", value: base },
    { key: "stripe-webhook", label: "Stripe webhook", where: "Stripe → Developers → Webhooks → the endpoint → Update details (editing keeps the signing secret)", value: `${base}/api/stripe/webhook` },
  ];
}
